/**
 * A recipe title reduced to a stable identity for the media cache.
 *
 * Recipes are household-scoped, so the same dish exists as a separate row for
 * every household. Keying media by recipe id therefore costs a fresh 100-unit
 * YouTube search per household for a dish that has already been resolved.
 * Keying by the normalized title collapses those into one.
 *
 * The key is derived on every read rather than stored: it is pure and cheap,
 * and a stored key silently mismatches after any change to this file, where a
 * derived one simply re-resolves everything consistently.
 */

/**
 * Words that carry no dish identity. Dropping them means "The Best Chicken
 * Kabsa Recipe" and "Chicken Kabsa" are one dish, and — because the scorer
 * reuses this set — that a video sharing only the word "recipe" with a dish
 * cannot score against it.
 */
export const GENERIC_TOKENS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'with', 'to', 'for', 'in', 'of',
  'recipe', 'recipes', 'easy', 'quick', 'best', 'homemade', 'how', 'make',
  'style', 'authentic', 'traditional', 'perfect', 'simple', 'classic',
  'ال', 'مع', 'في', 'من', 'على',
  'وصفه', 'وصفات', 'طريقه', 'عمل', 'سهله', 'سهل', 'سريقه', 'سريع',
  'الذ', 'افضل', 'بالبيت', 'منزلي', 'اصليه', 'تحضير',
]);

/**
 * Combining marks stripped before comparison:
 * - U+0300–U+036F  Latin combining accents, exposed by NFD
 * - U+064B–U+0652  Arabic tashkeel (fatha, damma, sukun, shadda …)
 * - U+0653–U+0655  maddah and hamza marks, which NFD splits off أ إ آ
 * - U+0640         tatweel, a purely decorative letter-stretching character
 */
const COMBINING = /[\u0300-\u036F\u064B-\u0652\u0653-\u0655\u0640]/g;

const NON_WORD = /[^\p{L}\p{N}\s]/gu;

/**
 * Title → content tokens, folded so that spelling variants of the same dish
 * collapse together. Arabic is written with optional diacritics and with
 * interchangeable letter forms, so an unfolded comparison treats كَبْسَة and
 * كبسه as different dishes.
 */
export function normalizeTokens(title: string): string[] {
  const folded = title
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(NON_WORD, ' ');

  return folded
    .split(/\s+/)
    .filter((token) => token.length > 0 && !GENERIC_TOKENS.has(token));
}

/**
 * Tokens are sorted before joining so "Kabsa Chicken" and "Chicken Kabsa" are
 * one key — the point of the whole exercise is that one dish resolves once.
 */
export function dishKey(title: string): string {
  return normalizeTokens(title).sort().join('-');
}
