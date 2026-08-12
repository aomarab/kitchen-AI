import {
  formatDate,
  formatHijriDate,
  formatNumber,
  type Locale,
  type MessageKey,
  type Translator,
} from '@kitchen/i18n';
import type { Ingredient, StorageLocation, StorageLocationType, Unit } from '@kitchen/contracts';
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

/**
 * What to call an item on this household's shelf.
 *
 * A household can rename what it keeps, because a recognised name is often not
 * the name they use — and `ingredient` is a row in a global catalog shared by
 * everyone, so the new name lives on the item. When they have not renamed it,
 * the catalog name in the active language stands.
 */
export function itemName(
  locale: Locale,
  item: {
    label: string | null;
    ingredient: Pick<Ingredient, 'canonicalNameEn' | 'canonicalNameAr'>;
  },
): string {
  return item.label ?? ingredientName(locale, item.ingredient);
}

export function formatQty(locale: Locale, value: number, prefs: NumeralPrefs = {}): string {
  return formatNumber(locale, value, {
    maximumFractionDigits: 2,
    easternNumerals: prefs.easternNumerals,
  });
}

export function unitLabel(t: Translator, unit: Unit): string {
  return t(`units.${unit}` as MessageKey);
}

/**
 * Names the API seeds a new household with. These are never shown: they exist
 * so the row has something to hold, and the client renders the *type* instead
 * so it reads natively in Arabic as well as English.
 */
const SEEDED_NAMES: Record<StorageLocationType, string> = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
  spice_rack: 'Spice rack',
  other: 'Other',
};

/**
 * Storage location name in the active language.
 *
 * A household's starting places are seeded in English, so rendering the stored
 * name directly left `Fridge` / `Freezer` sitting untranslated in the Arabic
 * UI — hence labelling by `type`, matching the web client (`lib/labels.ts`) and
 * the rule that the server never sends user-facing prose.
 *
 * A place the household added itself is different: its name is the user's own
 * words, in whichever language they typed, and translating "الرف اللي فوق
 * الفرن" into "Other" would be worse than useless. So a name that is not one of
 * the seeded ones is shown as written.
 */
export function locationLabel(
  t: Translator,
  location: Pick<StorageLocation, 'type'> & Partial<Pick<StorageLocation, 'name'>>,
): string {
  const name = location.name?.trim();
  if (name && name !== SEEDED_NAMES[location.type]) return name;
  return t(`inventory.locations.${location.type}` as MessageKey);
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
