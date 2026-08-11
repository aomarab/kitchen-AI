import type { Locale } from '@kitchen/contracts';
import { isPluralMessage, type PluralCategory, type PluralMessage } from './plural.js';
import { en as sharedEn, type Messages as SharedMessages } from './en.js';
import { ar as sharedAr } from './ar.js';
import { webEn } from './web.en.js';
import { webAr } from './web.ar.js';
import { mobileEn } from './mobile.en.js';
import { mobileAr } from './mobile.ar.js';

/**
 * Namespace ownership during parallel development. Each workstream writes only
 * its own files, so catalogs grow without merge conflicts:
 *   en.ts / ar.ts               -> coordinator (all shared domain strings)
 *   web.en.ts / web.ar.ts       -> web workstream
 *   mobile.en.ts / mobile.ar.ts -> mobile workstream
 */
export const en = { ...sharedEn, ...webEn, ...mobileEn };

export type Messages = typeof en;

export const ar: Messages = { ...sharedAr, ...webAr, ...mobileAr };

export { sharedEn, sharedAr };
export type { SharedMessages, Locale };

export const catalogs: Record<Locale, Messages> = { en, ar };

/* ------------------------------------------------------------------ */
/* Typed key paths                                                     */
/* ------------------------------------------------------------------ */

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : K) : never;

type Paths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string | PluralMessage ? K : Join<K, Paths<T[K]>>;
    }[keyof T & string];

/** Every valid message key, e.g. `'plans.generate'` or `'recipe.difficulty.easy'`. */
export type MessageKey = Paths<Messages>;

export type Interpolations = Record<string, string | number>;

export { plural } from './plural.js';
export type { PluralCategory, PluralForms, PluralMessage } from './plural.js';


/* ------------------------------------------------------------------ */
/* Direction                                                           */
/* ------------------------------------------------------------------ */

export type Direction = 'ltr' | 'rtl';

export const RTL_LOCALES: readonly Locale[] = ['ar'];

export function directionFor(locale: Locale): Direction {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

export function isRtl(locale: Locale): boolean {
  return directionFor(locale) === 'rtl';
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

function resolve(catalog: Messages, key: string): string | PluralMessage | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      catalog,
    );
  if (typeof value === 'string' || isPluralMessage(value)) return value;
  return undefined;
}

function interpolate(template: string, values?: Interpolations): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Pick the wording for a count, using the CLDR plural rules for the two
 * languages this app ships.
 *
 * `Intl.PluralRules` is deliberately NOT used. Hermes — the engine the mobile
 * app actually runs on — does not provide it, and the failure is silent: every
 * Arabic count above one quietly collapses to the `other` form, printing
 * `ينتهي خلال 2 يوم` where Arabic requires the dual `يومين`. That was observed on
 * a real simulator, not assumed. Encoding the rules here also makes web, API and
 * mobile agree, instead of varying with each runtime's ICU data.
 *
 * Arabic (CLDR): 0 zero · 1 one · 2 two · n%100 in 3..10 few ·
 * n%100 in 11..99 many · everything else (100, 101, fractions) other.
 * English (CLDR): exactly 1 with no fraction is one; everything else other.
 */
function selectCategory(locale: Locale, value: number): PluralCategory {
  const n = Math.abs(value);
  if (locale !== 'ar') return n === 1 ? 'one' : 'other';
  if (!Number.isInteger(n)) return 'other';
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
}

function render(locale: Locale, entry: string | PluralMessage, values?: Interpolations): string {
  if (typeof entry === 'string') return interpolate(entry, values);
  const raw = values?.[entry.count];
  const count = typeof raw === 'number' ? raw : Number(raw ?? 0);
  const category = Number.isFinite(count) ? selectCategory(locale, count) : 'other';
  // A locale that lacks the selected form falls back to its own `other`, never
  // to English — a half-Arabic sentence is worse than a slightly blunt one.
  return interpolate(entry.forms[category] ?? entry.forms.other, values);
}

/**
 * Translate a key. Falls back to English, then to the key itself, so a UI never
 * renders `undefined`.
 */
export function translate(locale: Locale, key: MessageKey, values?: Interpolations): string {
  const entry = resolve(catalogs[locale], key);
  if (entry !== undefined) return render(locale, entry, values);
  const fallback = resolve(en, key);
  return fallback === undefined ? key : render('en', fallback, values);
}

export type Translator = (key: MessageKey, values?: Interpolations) => string;

/** Bind a translator to a locale. */
export function createTranslator(locale: Locale): Translator {
  return (key, values) => translate(locale, key, values);
}

/* ------------------------------------------------------------------ */
/* Error rendering — the API only ever sends message keys (spec §8)    */
/* ------------------------------------------------------------------ */

export function translateErrorKey(
  locale: Locale,
  messageKey: string,
  values?: Interpolations,
): string {
  return translate(locale, messageKey as MessageKey, values);
}

/**
 * Whether a string names a real message.
 *
 * The API sends message keys rather than prose (spec §8), so anything it puts
 * in an error — including a key from a newer server than the installed client —
 * arrives as an unvalidated string. `translate` falls back to returning the key
 * itself, which would show the user `errors.PLAN_INFEASIBLE` verbatim. Checking
 * first lets a caller keep its own wording when the key means nothing here.
 *
 * English is the source of truth for the key set (`ar` is typed against it), so
 * one catalog is enough to decide.
 */
export function isMessageKey(key: string): key is MessageKey {
  return resolve(en, key) !== undefined;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ar: 'ar' };

export interface NumeralOptions {
  /** Use Eastern Arabic numerals (١٢٣). Off by default — see spec §7. */
  easternNumerals?: boolean;
}

export function formatNumber(
  locale: Locale,
  value: number,
  options: Intl.NumberFormatOptions & NumeralOptions = {},
): string {
  const { easternNumerals, ...intlOptions } = options;
  const tag =
    locale === 'ar' && easternNumerals ? 'ar-u-nu-arab' : `${INTL_LOCALE[locale]}-u-nu-latn`;
  return new Intl.NumberFormat(tag, intlOptions).format(value);
}

export function formatDate(
  locale: Locale,
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(`${INTL_LOCALE[locale]}-u-nu-latn`, options).format(value);
}

/** Hijri date, shown alongside the Gregorian date in the Arabic locale. */
export function formatHijriDate(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value);
}
