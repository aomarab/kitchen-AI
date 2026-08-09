import { eq, inArray, or, sql } from 'drizzle-orm';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IngredientCategory, Unit } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { EMBEDDINGS_PORT } from '../ai.constants.js';
import type { EmbeddingsPort } from './embeddings.port.js';
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
 *   3. create a new catalog row (only when `createIfMissing`).
 *
 * Embeddings are backfilled and used, but for ranking candidates the *model*
 * then chooses from — not for matching here. See `candidateNamesFor`.
 */
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const LATIN_SCRIPT = /[A-Za-z]/;

/**
 * Decides which supplied name belongs in which column.
 *
 * `canonicalNameEn` used to be set to whatever the caller passed, so an Arabic
 * plan wrote Arabic into the English column — 39 such rows out of 541 after a
 * single real weekly plan. An English-locale user then sees Arabic ingredient
 * names, and because the row is a duplicate of an existing English one, the
 * pantry it belongs to no longer matches it.
 *
 * Falling back to the other script is still better than dropping the
 * ingredient from the recipe, so the last resort keeps the value and the
 * caller logs it.
 */
export function splitByScript(input: {
  name: string;
  nameEn?: string;
  nameAr?: string;
}): { en: string; ar: string; guessed: boolean } {
  const candidates = [input.nameEn, input.name, input.nameAr].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  const latin = candidates.find((v) => LATIN_SCRIPT.test(v) && !ARABIC_SCRIPT.test(v));
  const arabic = candidates.find((v) => ARABIC_SCRIPT.test(v));
  return {
    en: latin ?? candidates[0]!,
    ar: arabic ?? input.nameAr ?? input.name,
    guessed: latin == null,
  };
}

@Injectable()
export class DrizzleIngredientResolver implements IngredientResolverPort {
  private readonly logger = new Logger(DrizzleIngredientResolver.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EMBEDDINGS_PORT) private readonly embeddings: EmbeddingsPort,
  ) {}

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

    // Step 3 (embedding auto-match) is deliberately not a step. See
    // `candidateNamesFor` — measured on the real catalog, vector distance
    // cannot separate a synonym from a neighbouring ingredient, and a silent
    // wrong attach here would cross dietary boundaries. Embeddings rank
    // candidates for the model instead of quietly deciding for it.

    // Third pass: the caller's canonical English name. An Arabic plan sends
    // Arabic ingredient names, and the catalog is seeded in English, so
    // "جبن فيتا" misses "Feta cheese" and creates a duplicate — after which the
    // household's actual feta no longer matches its own recipe and coverage
    // reports a shortfall for food it has. Measured on a real weekly plan: 39
    // duplicate rows, 7% of the catalog.
    if (pending.size > 0) await this.matchAlternate(pending, inputs, results);

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

  /**
   * Nearest catalog names to the given texts, best first.
   *
   * This is what the embeddings are for. The AI resolver used to be handed
   * `candidateNames(200)` — an arbitrary, unordered 200 of 509 rows, so the
   * correct ingredient was frequently not among the options it was allowed to
   * pick from. Ranking by vector distance puts the plausible answers in front
   * of it instead, in fewer tokens.
   *
   * Note what this deliberately does *not* do: decide. Measured against the
   * real backfilled catalog, distance cannot tell a synonym from a different
   * ingredient — "Chicken stock cube" and "Beef stock cube" sit 0.141 apart
   * while the correct match for a typed "chicken breasts" is 0.414 away. Any
   * threshold that accepts the second silently accepts the first, and this app
   * treats halal as absolute. So candidates are proposed and the model, which
   * can read "beef", chooses.
   */
  async candidateNamesFor(texts: string[], limit: number): Promise<string[]> {
    const cleaned = texts.map((t) => t.trim()).filter((t) => t.length > 0);
    if (cleaned.length === 0 || limit <= 0) return this.candidateNames(limit);

    let vectors: number[][];
    try {
      vectors = await this.embeddings.embed(cleaned);
    } catch (err) {
      this.logger.warn(`candidate embedding failed, using unranked catalog: ${String(err)}`);
      return this.candidateNames(limit);
    }

    // Per query take a few nearest, then merge preserving best-rank order.
    const perQuery = Math.max(3, Math.ceil(limit / cleaned.length) + 2);
    const ranked = new Map<string, number>();
    try {
      for (const vector of vectors) {
        const literal = `[${vector.join(',')}]`;
        const rows = (await this.db
          .select({
            name: ingredients.canonicalNameEn,
            distance: sql<number>`${ingredients.embedding} <=> ${literal}::vector`,
          })
          .from(ingredients)
          .where(sql`${ingredients.embedding} IS NOT NULL`)
          .orderBy(sql`${ingredients.embedding} <=> ${literal}::vector`)
          .limit(perQuery)) as { name: string; distance: number }[];
        for (const row of rows) {
          const prev = ranked.get(row.name);
          const d = Number(row.distance);
          if (prev == null || d < prev) ranked.set(row.name, d);
        }
      }
    } catch (err) {
      this.logger.warn(`candidate vector query failed: ${String(err)}`);
      return this.candidateNames(limit);
    }

    if (ranked.size === 0) return this.candidateNames(limit);
    return [...ranked.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit)
      .map(([name]) => name);
  }

  /**
   * Retries the still-unresolved inputs under their alternate (English) name.
   *
   * Deliberately a separate pass rather than a widened first query: the
   * locale-facing name is the better signal and must win, so the alternate is
   * only consulted for what is left over.
   */
  private async matchAlternate(
    pending: Map<string, number[]>,
    inputs: ResolveNameInput[],
    results: (ResolvedName | null)[],
  ): Promise<void> {
    const altPending = new Map<string, number[]>();
    for (const [key, idxs] of pending) {
      for (const i of idxs) {
        const alt = inputs[i]?.nameEn?.trim();
        if (!alt) continue;
        const altKey = normalize(alt);
        if (altKey === key || altKey.length === 0) continue;
        const list = altPending.get(altKey) ?? [];
        list.push(i);
        altPending.set(altKey, list);
      }
    }
    if (altPending.size === 0) return;

    const altNames = [...altPending.keys()];
    await this.matchExact(altNames, altPending, inputs, results);
    const rest = [...altPending.keys()];
    if (rest.length > 0) await this.matchAlias(rest, altPending, inputs, results);

    // Drop whatever the alternate pass resolved from the primary map, and any
    // key left with no unresolved indices behind it.
    for (const [key, idxs] of [...pending]) {
      const remaining = idxs.filter((i) => results[i] == null);
      if (remaining.length === 0) pending.delete(key);
      else pending.set(key, remaining);
    }
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
    const { en, ar } = splitByScript(input);
    const canonicalNameEn = titleCase(en);
    // Every name we were given becomes an alias, so the next plan that uses
    // any of them matches this row instead of creating another one.
    const aliases = [
      ...new Set([input.name, input.nameEn, input.nameAr].filter(Boolean).map((n) => normalize(n!))),
    ];
    const values = {
      canonicalNameEn,
      canonicalNameAr: ar,
      category: (input.category ?? 'other') as IngredientCategory,
      defaultUnit: (input.defaultUnit ?? 'g') as Unit,
      aliases,
      isStaple: false,
    };

    if (splitByScript(input).guessed) {
      this.logger.warn(
        `creating catalog row "${canonicalNameEn}" with no English name — the model omitted nameEn`,
      );
    }

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
    // Ordered so the same prompt is built twice the same way. Unordered LIMIT
    // over a table other code writes to returns whatever the heap scan reaches
    // first, which changes under any UPDATE (the embedding backfill rewrote
    // every row) and quietly breaks response-cache hits.
    const rows = (await this.db
      .select({ name: ingredients.canonicalNameEn })
      .from(ingredients)
      .orderBy(ingredients.canonicalNameEn)
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
