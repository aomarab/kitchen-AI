import '../config/load-dotenv.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ingredientCategorySchema, unitSchema } from '@kitchen/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ingredients } from './schema.js';

/**
 * Seeds the global bilingual ingredient catalog from `seed-data/*.json`.
 *
 * The catalog is what makes pantry coverage a deterministic SQL question rather
 * than fuzzy string matching (spec §4.2), so it must exist before any plan can
 * be generated. Embeddings are deliberately left NULL — the AI service
 * backfills them, and the seed must run without an OpenAI key.
 *
 * Idempotent: ids are UUIDv5 derived from the slug, so re-running updates rows
 * in place instead of creating duplicates.
 */

const SEED_FILES = ['produce.json', 'protein.json', 'pantry.json', 'flavor.json'] as const;

/** Fixed namespace so slug -> id is stable across machines and environments. */
const UUID_NAMESPACE = 'b9f5c1d2-3a4e-4f6b-8c7d-1e2f3a4b5c6d';

interface SeedIngredient {
  slug: string;
  canonicalNameEn: string;
  canonicalNameAr: string;
  category: string;
  defaultUnit: string;
  aliases: string[];
  isStaple: boolean;
}

function uuidV5(name: string): string {
  const namespaceBytes = Buffer.from(UUID_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(namespaceBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/**
 * The JSON lives beside the sources, so resolve against both the source tree and
 * the compiled output rather than assuming a working directory.
 */
function seedDataDir(): string {
  const candidates = [
    join(__dirname, 'seed-data'),
    resolve(__dirname, '../../src/db/seed-data'),
    resolve(process.cwd(), 'apps/api/src/db/seed-data'),
    resolve(process.cwd(), 'src/db/seed-data'),
  ];

  for (const dir of candidates) {
    try {
      readFileSync(join(dir, SEED_FILES[0]));
      return dir;
    } catch {
      continue;
    }
  }

  throw new Error(`Could not locate seed-data directory. Looked in:\n  ${candidates.join('\n  ')}`);
}

function loadCatalog(): SeedIngredient[] {
  const dir = seedDataDir();
  const rows: SeedIngredient[] = [];

  for (const file of SEED_FILES) {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);
    rows.push(...(parsed as SeedIngredient[]));
  }

  return rows;
}

/** Fails loudly on bad data — a silent bad unit corrupts every coverage calculation. */
function validate(rows: SeedIngredient[]): void {
  const errors: string[] = [];
  const slugs = new Set<string>();
  const names = new Set<string>();

  rows.forEach((row, index) => {
    const at = `${row.slug || `#${index}`}`;

    if (!/^[a-z0-9-]+$/.test(row.slug ?? '')) errors.push(`${at}: invalid slug`);
    if (slugs.has(row.slug)) errors.push(`${at}: duplicate slug`);
    slugs.add(row.slug);

    const key = row.canonicalNameEn?.toLowerCase();
    if (!key) errors.push(`${at}: missing canonicalNameEn`);
    else if (names.has(key)) errors.push(`${at}: duplicate canonicalNameEn "${row.canonicalNameEn}"`);
    names.add(key);

    if (!/[\u0600-\u06FF]/.test(row.canonicalNameAr ?? '')) {
      errors.push(`${at}: canonicalNameAr is not Arabic script`);
    }
    if (!ingredientCategorySchema.safeParse(row.category).success) {
      errors.push(`${at}: invalid category "${row.category}"`);
    }
    if (!unitSchema.safeParse(row.defaultUnit).success) {
      errors.push(`${at}: invalid defaultUnit "${row.defaultUnit}"`);
    }
    if (!Array.isArray(row.aliases)) errors.push(`${at}: aliases must be an array`);
    if (typeof row.isStaple !== 'boolean') errors.push(`${at}: isStaple must be a boolean`);
  });

  if (errors.length > 0) {
    throw new Error(`Seed catalog is invalid:\n  ${errors.slice(0, 40).join('\n  ')}`);
  }
}

async function main(): Promise<void> {
  const rows = loadCatalog();
  validate(rows);

  const staples = rows.filter((row) => row.isStaple);
  if (staples.length === 0) {
    throw new Error('No staples in the catalog — every daily plan would fail validation.');
  }

  const dryRun = process.argv.includes('--dry-run');
  console.warn(`Catalog: ${rows.length} ingredients, ${staples.length} staples.`);
  if (dryRun) {
    console.warn('Dry run — nothing written.');
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const values = rows.map((row) => ({
    id: uuidV5(row.slug),
    canonicalNameEn: row.canonicalNameEn,
    canonicalNameAr: row.canonicalNameAr,
    category: row.category as (typeof ingredients.$inferInsert)['category'],
    defaultUnit: row.defaultUnit as (typeof ingredients.$inferInsert)['defaultUnit'],
    aliases: [...new Set([row.slug.replace(/-/g, ' '), ...row.aliases])],
    isStaple: row.isStaple,
  }));

  /*
   * `ingredients` is unique on lower(canonical_name_en), and a household may
   * already have created a row by hand with that name. Match on the name first
   * so the seed enriches that row rather than colliding with it.
   */
  const names = values.map((value) => value.canonicalNameEn.toLowerCase());
  const existing = await client<{ id: string; key: string }[]>`
    SELECT id, lower(canonical_name_en) AS key
    FROM ingredients
    WHERE lower(canonical_name_en) = ANY(${names})
  `;
  const existingByName = new Map(existing.map((row) => [row.key, row.id]));

  const inserts = values.filter((value) => !existingByName.has(value.canonicalNameEn.toLowerCase()));
  const updates = values.filter((value) => existingByName.has(value.canonicalNameEn.toLowerCase()));

  // Chunked so a 500-row insert stays well under the bind parameter limit.
  const CHUNK = 100;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    await db
      .insert(ingredients)
      .values(inserts.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }

  for (const value of updates) {
    const id = existingByName.get(value.canonicalNameEn.toLowerCase())!;
    await db
      .update(ingredients)
      .set({
        canonicalNameAr: value.canonicalNameAr,
        category: value.category,
        defaultUnit: value.defaultUnit,
        aliases: value.aliases,
        isStaple: value.isStaple,
      })
      .where(eq(ingredients.id, id));
  }

  const counted = await client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM ingredients
  `;
  await client.end();

  console.warn(
    `Seeded ${inserts.length} new and refreshed ${updates.length} existing ingredients. ` +
      `Table now holds ${counted[0]?.count ?? 0} rows.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
