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

/**
 * The same match, widened to a household's own name for an item.
 *
 * A household that renames an item then searched for the name it just gave
 * it and found nothing, because the query only ever saw the global catalog.
 * Catalog search deliberately keeps using {@link ingredientNameMatches} — a
 * label belongs to one household's shelf, not to the shared dictionary.
 */
export function inventoryNameMatches(rawQuery: string, label: AnyColumn): SQL {
  const like = `%${escapeLike(normalizeArabic(rawQuery))}%`;
  return sql`(${ingredientNameMatches(rawQuery)} or ${normalizedSql(label)} like ${like})`;
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

// Arabic block, Arabic Supplement, Extended-A and the presentation forms.
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Whether a name is written in Arabic script. */
export function isArabicScript(value: string): boolean {
  return ARABIC_SCRIPT.test(value);
}

/**
 * Sort a free-text ingredient name (and optionally its translation) into the
 * `ingredients` columns.
 *
 * The table is global — shared by every household — and both name columns are
 * NOT NULL. When the caller knows both names each goes in its own column, so
 * an English household sees English and an Arabic one sees Arabic. That is the
 * case worth getting right: recognition returns both, and dropping one used to
 * put Arabic model output into `canonical_name_en` for everyone.
 *
 * With only one name there is nothing to translate, so it is mirrored and both
 * spellings are kept as aliases; `ingredientNameEquals` then resolves the row
 * from either script if the other name turns up later.
 */
export function bilingualNames(
  rawName: string,
  rawNameAr?: string,
): { en: string; ar: string; aliases: string[] } {
  const primary = rawName.trim();
  const other = rawNameAr?.trim();

  if (!other || other === primary) return { en: primary, ar: primary, aliases: [primary] };

  // `rawName` is normally the English name, but the manual-add path sends
  // whatever the user typed — so trust the script over the field name.
  return isArabicScript(primary) && !isArabicScript(other)
    ? { en: other, ar: primary, aliases: [other, primary] }
    : { en: primary, ar: other, aliases: [primary, other] };
}
