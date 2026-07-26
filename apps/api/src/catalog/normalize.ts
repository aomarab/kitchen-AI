import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { ingredients } from '../db/schema.js';

/**
 * Bilingual search normalization. Arabic is written with optional diacritics
 * (tashkeel) and several interchangeable letter forms, so a naive `LIKE` misses
 * obvious matches. We fold the text the same way in JS (for the query term) and
 * in SQL (for the stored columns) so "طَمَاطِم", "طماطم" and "اطماطم" all line
 * up. See spec §3 / task catalog requirements.
 */

// Tatweel (U+0640), all tashkeel (U+064B–U+0655) and superscript alef (U+0670).
// These are combining marks; matching them individually to strip them is the
// intent, so the misleading-character-class heuristic is a false positive here.
// eslint-disable-next-line no-misleading-character-class
const TASHKEEL = /[\u0640\u064B-\u0655\u0670]/g;
// Alef variants: آ أ إ ٱ  →  ا
const ALEF = /[\u0622\u0623\u0625\u0671]/g;
// Alef maqsura ى → ya ي
const ALEF_MAQSURA = /\u0649/g;

export function normalizeArabic(value: string): string {
  return value
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(ALEF, '\u0627')
    .replace(ALEF_MAQSURA, '\u064A')
    .trim();
}

/** Escape LIKE wildcards; Postgres's default LIKE escape char is backslash. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// SQL mirror of normalizeArabic via translate(): map the letter forms, then
// drop every remaining diacritic. Order matters — translate deletes any `from`
// character with no positional `to` counterpart.
const NORM_FROM = '\u0622\u0623\u0625\u0671\u0649\u0640\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0653\u0654\u0655\u0670';
const NORM_TO = '\u0627\u0627\u0627\u0627\u064A';

function normalizedSql(column: AnyColumn | SQL): SQL<string> {
  return sql<string>`translate(lower(${column}), ${NORM_FROM}, ${NORM_TO})`;
}

/**
 * A WHERE condition matching the normalized query against an ingredient's
 * English name, Arabic name and every alias. Works on the `ingredients` table,
 * so both catalog search and inventory search share it.
 */
export function ingredientNameMatches(rawQuery: string): SQL {
  const like = `%${escapeLike(normalizeArabic(rawQuery))}%`;
  return sql`(
    ${normalizedSql(ingredients.canonicalNameEn)} like ${like}
    or ${normalizedSql(ingredients.canonicalNameAr)} like ${like}
    or exists (
      select 1 from unnest(${ingredients.aliases}) as alias(value)
      where translate(lower(alias.value), ${NORM_FROM}, ${NORM_TO}) like ${like}
    )
  )`;
}

/** A WHERE condition for an exact normalized match (used to resolve names). */
export function ingredientNameEquals(rawName: string): SQL {
  const normalized = normalizeArabic(rawName);
  return sql`(
    ${normalizedSql(ingredients.canonicalNameEn)} = ${normalized}
    or ${normalizedSql(ingredients.canonicalNameAr)} = ${normalized}
    or exists (
      select 1 from unnest(${ingredients.aliases}) as alias(value)
      where translate(lower(alias.value), ${NORM_FROM}, ${NORM_TO}) = ${normalized}
    )
  )`;
}
