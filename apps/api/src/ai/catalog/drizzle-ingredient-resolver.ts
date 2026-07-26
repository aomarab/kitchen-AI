import { eq, inArray, or, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { IngredientCategory, Unit } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { ingredients } from '../../db/schema.js';
import type { CatalogIngredientRef } from '../planner/types.js';
import type {
  IngredientResolverPort,
  ResolveNameInput,
  ResolvedName,
} from './ingredient-resolver.port.js';

type Row = typeof ingredients.$inferSelect;

const COLUMNS = {
  id: ingredients.id,
  canonicalNameEn: ingredients.canonicalNameEn,
  canonicalNameAr: ingredients.canonicalNameAr,
  aliases: ingredients.aliases,
  category: ingredients.category,
  defaultUnit: ingredients.defaultUnit,
  isStaple: ingredients.isStaple,
  embedding: ingredients.embedding,
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * `ingredients` is a single global table — it has no `householdId`. Anything
 * created here is visible to every household forever, and is fed back into the
 * next household's prompt by `candidateNames()`. That closes a loop: text an
 * attacker controls (a printed receipt line, a typed item name) becomes model
 * output, becomes a catalog row, becomes prompt input for someone else.
 *
 * So creation is gated on the name looking like an ingredient name and nothing
 * else. Anything longer, multi-line, or carrying punctuation used to structure
 * prompts is resolved as `unresolved` instead — the user still sees their item,
 * it just doesn't earn a permanent global row.
 */
const MAX_CREATABLE_NAME_CHARS = 60;

/**
 * Letters (any script), digits, spaces and the few separators that show up in
 * real ingredient names. No newlines, quotes, braces, colons or guillemets.
 */
const CATALOG_NAME_CHARS = /^[\p{L}\p{N} ()%.,'’\-/&+]+$/u;
const NON_CATALOG_NAME_CHARS = /[^\p{L}\p{N} ()%.,'’\-/&+]+/gu;

export function isCreatableName(value: string): boolean {
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_CREATABLE_NAME_CHARS) return false;
  return CATALOG_NAME_CHARS.test(name);
}

/**
 * The manual-add path has no "unresolved" outcome — the user typed a name and
 * expects their item saved — so there rejecting is the wrong answer for a name
 * that is merely punctuated oddly ("Milk: whole"). Strip what may not enter the
 * global catalog and keep the rest. Returns null only when nothing usable is
 * left, which is the case worth refusing.
 */
export function toCatalogName(value: string): string | null {
  const cleaned = value
    .replace(NON_CATALOG_NAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CREATABLE_NAME_CHARS)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function titleCase(value: string): string {
  const v = value.trim();
  return v.length > 0 ? v[0]!.toUpperCase() + v.slice(1) : v;
}

function toRef(row: {
  id: string;
  canonicalNameEn: string;
  canonicalNameAr: string;
  aliases: string[];
  category: IngredientCategory;
  defaultUnit: Unit;
  isStaple: boolean;
}): CatalogIngredientRef {
  return {
    id: row.id,
    canonicalNameEn: row.canonicalNameEn,
    canonicalNameAr: row.canonicalNameAr,
    aliases: row.aliases ?? [],
    category: row.category,
    defaultUnit: row.defaultUnit,
    isStaple: row.isStaple,
  };
}

/**
 * Drizzle-backed resolver. Resolution ladder (spec §5.1 step 4):
 *   1. exact canonical name (English or Arabic)
 *   2. alias match
 *   3. embedding similarity — a no-op today because embeddings are not yet
 *      backfilled; wired to activate automatically once the HNSW column is
 *      populated, so the code path degrades gracefully rather than failing.
 *   4. create a new catalog row (only when `createIfMissing`).
 */
@Injectable()
export class DrizzleIngredientResolver implements IngredientResolverPort {
  constructor(@Inject(DB) private readonly db: Database) {}

  async resolve(
    inputs: ResolveNameInput[],
    opts: { createIfMissing?: boolean } = {},
  ): Promise<ResolvedName[]> {
    const results: (ResolvedName | null)[] = inputs.map(() => null);
    const pending = new Map<string, number[]>(); // normalized name -> input indices
    inputs.forEach((input, i) => {
      const key = normalize(input.name);
      const list = pending.get(key) ?? [];
      list.push(i);
      pending.set(key, list);
    });

    const distinct = [...pending.keys()];
    if (distinct.length === 0) return [];

    await this.matchExact(distinct, pending, inputs, results);
    const residue1 = [...pending.keys()];
    if (residue1.length > 0) await this.matchAlias(residue1, pending, inputs, results);

    // Step 3 (embedding) intentionally skipped until embeddings exist.

    const residue2 = [...pending.keys()];
    for (const key of residue2) {
      const idxs = pending.get(key)!;
      for (const i of idxs) {
        if (opts.createIfMissing && isCreatableName(inputs[i]!.name)) {
          const created = await this.create(inputs[i]!);
          results[i] = { rawName: inputs[i]!.name, ingredient: created, strategy: 'created', confidence: 0.5 };
        } else {
          results[i] = { rawName: inputs[i]!.name, ingredient: null, strategy: 'unresolved', confidence: 0 };
        }
      }
      pending.delete(key);
    }

    return results.map((r, i) => r ?? { rawName: inputs[i]!.name, ingredient: null, strategy: 'unresolved', confidence: 0 });
  }

  private async matchExact(
    names: string[],
    pending: Map<string, number[]>,
    inputs: ResolveNameInput[],
    results: (ResolvedName | null)[],
  ): Promise<void> {
    const rows = await this.db
      .select(COLUMNS)
      .from(ingredients)
      .where(
        or(
          inArray(sql`lower(${ingredients.canonicalNameEn})`, names),
          inArray(sql`lower(${ingredients.canonicalNameAr})`, names),
        ),
      );

    for (const row of rows as Row[]) {
      const ref = toRef(row);
      for (const candidate of [normalize(row.canonicalNameEn), normalize(row.canonicalNameAr)]) {
        const idxs = pending.get(candidate);
        if (!idxs) continue;
        for (const i of idxs) {
          results[i] = { rawName: inputs[i]!.name, ingredient: ref, strategy: 'exact', confidence: 0.99 };
        }
        pending.delete(candidate);
      }
    }
  }

  private async matchAlias(
    names: string[],
    pending: Map<string, number[]>,
    inputs: ResolveNameInput[],
    results: (ResolvedName | null)[],
  ): Promise<void> {
    const rows = await this.db
      .select(COLUMNS)
      .from(ingredients)
      .where(
        sql`EXISTS (SELECT 1 FROM unnest(${ingredients.aliases}) AS a(val) WHERE lower(a.val) IN (${sql.join(
          names.map((n) => sql`${n}`),
          sql`, `,
        )}))`,
      );

    for (const row of rows as Row[]) {
      const ref = toRef(row);
      for (const alias of row.aliases ?? []) {
        const key = normalize(alias);
        const idxs = pending.get(key);
        if (!idxs) continue;
        for (const i of idxs) {
          results[i] = { rawName: inputs[i]!.name, ingredient: ref, strategy: 'alias', confidence: 0.9 };
        }
        pending.delete(key);
      }
    }
  }

  private async create(input: ResolveNameInput): Promise<CatalogIngredientRef> {
    const canonicalNameEn = titleCase(input.name);
    const values = {
      canonicalNameEn,
      canonicalNameAr: input.nameAr ?? input.name,
      category: (input.category ?? 'other') as IngredientCategory,
      defaultUnit: (input.defaultUnit ?? 'g') as Unit,
      aliases: [normalize(input.name)],
      isStaple: false,
    };

    const inserted = (await this.db
      .insert(ingredients)
      .values(values)
      .onConflictDoNothing()
      .returning(COLUMNS)) as Row[];

    if (inserted[0]) return toRef(inserted[0]);

    // Lost a race (or name already existed) — read the existing row back.
    const existing = (await this.db
      .select(COLUMNS)
      .from(ingredients)
      .where(sql`lower(${ingredients.canonicalNameEn}) = ${normalize(canonicalNameEn)}`)
      .limit(1)) as Row[];
    return toRef(existing[0]!);
  }

  async findByIds(ids: string[]): Promise<Map<string, CatalogIngredientRef>> {
    if (ids.length === 0) return new Map();
    const rows = (await this.db.select(COLUMNS).from(ingredients).where(inArray(ingredients.id, ids))) as Row[];
    return new Map(rows.map((row) => [row.id, toRef(row)]));
  }

  async candidateNames(limit: number): Promise<string[]> {
    const rows = (await this.db
      .select({ name: ingredients.canonicalNameEn })
      .from(ingredients)
      .limit(limit)) as { name: string }[];
    return rows.map((r) => r.name);
  }

  async addAliases(ingredientId: string, aliases: string[]): Promise<void> {
    const clean = aliases.map((a) => a.trim()).filter((a) => a.length > 0);
    if (clean.length === 0) return;
    // Append only aliases not already present (case-insensitive), atomically.
    await this.db
      .update(ingredients)
      .set({
        aliases: sql`(
          select array_agg(distinct a)
          from unnest(${ingredients.aliases} || ${clean}::text[]) as a
        )`,
      })
      .where(eq(ingredients.id, ingredientId));
  }
}
