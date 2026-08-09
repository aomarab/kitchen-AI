import type { Locale } from '@kitchen/i18n';

/** Picks the Arabic or English variant of a bilingual name for the active locale. */
export function localizedName(locale: Locale, names: { en: string; ar: string }): string {
  return locale === 'ar' ? names.ar : names.en;
}
