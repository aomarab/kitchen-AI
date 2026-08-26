import type { Locale } from '@kitchen/contracts';

export const GENERIC_TOKENS = [
  'recipe',
  'recipes',
  'easy',
  'quick',
  'best',
  'homemade',
  'how',
  'to',
  'make',
  'style',
  'authentic',
  'وصفة',
  'وصفات',
  'طريقة',
  'عمل',
  'سهلة',
  'سريعة',
  'ألذ',
  'أفضل',
  'بالبيت',
] as const;

const WHITESPACE = /\s+/g;
const PUNCTUATION_OR_SYMBOL = /[\p{P}\p{S}]+/gu;
/** Tatweel is a spacing elongation glyph; the harakat are nonspacing marks.
 *  Matching the whole Mn category also covers diacritics a title may carry
 *  beyond the eight core harakat. */
const TASHKEEL_OR_TATWEEL = /\u0640|\p{Mn}/gu;
/** Precomposed alef-hamza forms; input is NFC-folded first so the decomposed
 *  spellings collapse onto these rather than slipping through. */
const ALEF_VARIANT = /[\u0623\u0625\u0622]/gu;

/**
 * Arabic's definite article is a bound prefix, not a separate word, and it
 * attaches to every noun and adjective in a definite phrase. Stripping it from
 * the leading token alone made `الدجاج المشوي` and `دجاج مشوي` — the same dish —
 * produce different keys, which is exactly the collapsing this key exists to do.
 *
 * The length guard protects short roots that merely begin with alef-lam: `ألذ`
 * normalizes to `الذ`, and stripping it would leave a single letter that no
 * longer matches its entry in the generic list below. Every real Arabic food
 * word leaves at least two letters behind.
 */
const ARABIC_ARTICLE_MIN_LENGTH = 4;

/**
 * Recipe titles attach conjunctions and prepositions to the following word the
 * same way: `شكشوكة بالجبنة` is "shakshuka with the cheese", where `بال` is
 * bi- plus the article. Only the forms that carry the article are stripped,
 * because the article disambiguates them. A bare leading `ب` cannot be removed
 * safely — `بصل` (onion) and `بطاطس` (potato) are ingredients that simply begin
 * with it, and stripping would turn them into different words.
 */
const ARABIC_PREFIX_WITH_ARTICLE = /^[بولكف]ال/u;
const ARABIC_PREFIX_WITH_ARTICLE_MIN_LENGTH = 5;
/** li- + al- elides the alef: `للدجاج` is "for the chicken". */
const ARABIC_LAM_ARTICLE_MIN_LENGTH = 4;

const GENERIC_BY_LOCALE: Record<Locale, ReadonlySet<string>> = {
  en: new Set(GENERIC_TOKENS.map((token) => stripArticle(normalizeTokenText(token, 'en'), 'en'))),
  ar: new Set(GENERIC_TOKENS.map((token) => stripArticle(normalizeTokenText(token, 'ar'), 'ar'))),
};

/**
 * Cache keys use `${locale}:${tokens}` so translated titles never share media.
 */
export function dishKey(title: string, locale: Locale): string {
  const tokens = contentTokens(title, locale).sort();

  return `${locale}:${tokens.join('-')}`;
}

/**
 * The same distinctive tokens the key is built from, kept in the order the
 * title wrote them. The key sorts, which is right for identity and wrong for
 * judging relevance: which end of the phrase holds the dish is what tells a
 * shakshuka video apart from a banana cheesecake.
 */
export function dishTokensInOrder(title: string, locale: Locale): string[] {
  return contentTokens(title, locale);
}

/**
 * The single word to search when the full title is too specific to match
 * anything. Kept in the title's original spelling — the normalization that
 * builds keys folds `ة` to `ه` and strips hamza, which is right for comparing
 * and wrong for querying, because it hands YouTube a misspelling.
 *
 * Which end holds the dish follows the grammar, the same way the relevance gate
 * picks its head token: Arabic is head-initial, English compounds head-final.
 */
export function dishHeadQuery(title: string, locale: Locale): string {
  const generic = GENERIC_BY_LOCALE[locale];
  const words = title
    .split(WHITESPACE)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !generic.has(normalizeTokenText(word, locale)));

  if (words.length === 0) return title;

  return locale === 'ar' ? words[0]! : words[words.length - 1]!;
}

function contentTokens(title: string, locale: Locale): string[] {
  const genericTokens = GENERIC_BY_LOCALE[locale];
  const normalized = normalizeTokenText(title, locale);
  const tokens = normalized.length > 0 ? normalized.split(' ') : [];

  return tokens
    .map((token) => stripArticle(token, locale))
    .filter((token) => token.length > 0 && !genericTokens.has(token));
}

function normalizeTokenText(value: string, locale: Locale): string {
  let normalized = value.normalize('NFC').trim().replace(WHITESPACE, ' ').toLocaleLowerCase(locale);
  normalized = normalized.replace(PUNCTUATION_OR_SYMBOL, ' ');

  if (locale === 'ar') {
    normalized = normalized
      .replace(TASHKEEL_OR_TATWEEL, '')
      .replace(ALEF_VARIANT, 'ا')
      .replace(/\u0629/gu, '\u0647')
      .replace(/\u0649/gu, '\u064A');
  }

  return normalized.trim().replace(WHITESPACE, ' ');
}

function stripArticle(token: string, locale: Locale): string {
  if (locale === 'en') {
    return token === 'the' ? '' : token;
  }

  if (ARABIC_PREFIX_WITH_ARTICLE.test(token) && token.length >= ARABIC_PREFIX_WITH_ARTICLE_MIN_LENGTH) {
    return token.slice(3);
  }

  if (token.startsWith('لل') && token.length >= ARABIC_LAM_ARTICLE_MIN_LENGTH) {
    return token.slice(2);
  }

  return token.startsWith('ال') && token.length >= ARABIC_ARTICLE_MIN_LENGTH
    ? token.slice(2)
    : token;
}
