import type { Locale } from '@kitchen/contracts';
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
      [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>>;
    }[keyof T & string];

/** Every valid message key, e.g. `'plans.generate'` or `'recipe.difficulty.easy'`. */
export type MessageKey = Paths<Messages>;

export type Interpolations = Record<string, string | number>;

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

function resolve(catalog: Messages, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      catalog,
    );
  return typeof value === 'string' ? value : undefined;
}

function interpolate(template: string, values?: Interpolations): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Translate a key. Falls back to English, then to the key itself, so a UI never
 * renders `undefined`.
 */
export function translate(locale: Locale, key: MessageKey, values?: Interpolations): string {
  const template = resolve(catalogs[locale], key) ?? resolve(en, key) ?? key;
  return interpolate(template, values);
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
