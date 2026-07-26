import {
  formatDate,
  formatHijriDate,
  formatNumber,
  type Locale,
  type MessageKey,
  type Translator,
} from '@kitchen/i18n';
import type { Ingredient, Unit } from '@kitchen/contracts';
import { daysUntilExpiry } from './expiry';

export interface NumeralPrefs {
  easternNumerals?: boolean;
}

/** Pick the language-appropriate string from a bilingual pair. */
export function localizedName(locale: Locale, en: string, ar: string): string {
  return locale === 'ar' ? ar : en;
}

/** Catalog ingredient name in the active language. */
export function ingredientName(
  locale: Locale,
  ingredient: Pick<Ingredient, 'canonicalNameEn' | 'canonicalNameAr'>,
): string {
  return locale === 'ar' ? ingredient.canonicalNameAr : ingredient.canonicalNameEn;
}

export function formatQty(locale: Locale, value: number, prefs: NumeralPrefs = {}): string {
  return formatNumber(locale, value, {
    maximumFractionDigits: 2,
    easternNumerals: prefs.easternNumerals,
  });
}

export function unitLabel(t: Translator, unit: Unit): string {
  return t(`mobile.units.${unit}` as MessageKey);
}

/** e.g. `2 kg`, `٣ قطعة`. Direction of the surrounding text handles ordering. */
export function formatMeasure(
  t: Translator,
  locale: Locale,
  value: number,
  unit: Unit,
  prefs: NumeralPrefs = {},
): string {
  return `${formatQty(locale, value, prefs)} ${unitLabel(t, unit)}`;
}

export function formatDateL(
  locale: Locale,
  iso: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatDate(locale, iso, options);
}

/** Gregorian date, plus the Hijri date in Arabic when the user opts in. */
export function formatDateWithHijri(
  locale: Locale,
  iso: string | Date,
  showHijri: boolean,
  options?: Intl.DateTimeFormatOptions,
): string {
  const gregorian = formatDate(locale, iso, options);
  if (locale === 'ar' && showHijri) {
    return `${gregorian} · ${formatHijriDate(iso)}`;
  }
  return gregorian;
}

/**
 * Localised "expires in N days" / "today" / "expired" label, or `null` when the
 * item has no expiry date. Uses the shared `inventory.*` keys.
 */
export function formatExpiryLabel(
  t: Translator,
  locale: Locale,
  expiresAt: string | null,
  prefs: NumeralPrefs = {},
  now: Date = new Date(),
): string | null {
  const days = daysUntilExpiry(expiresAt, now);
  if (days === null) return null;
  if (days < 0) return t('inventory.expired');
  if (days === 0) return t('inventory.expiresToday');
  return t('inventory.expiresIn', { days: formatQty(locale, days, prefs) });
}

/** Minutes as a compact localised numeral, for prep/cook badges. */
export function formatMinutes(locale: Locale, minutes: number, prefs: NumeralPrefs = {}): string {
  return formatQty(locale, minutes, prefs);
}

/** Currency-ish USD display for the AI usage screen. */
export function formatUsd(locale: Locale, value: number, prefs: NumeralPrefs = {}): string {
  return formatNumber(locale, value, {
    style: 'currency',
    currency: 'USD',
    easternNumerals: prefs.easternNumerals,
  });
}
