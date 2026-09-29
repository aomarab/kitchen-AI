import type { Ingredient, InventoryItem, StorageLocation, Unit } from '@kitchen/contracts';
import type { Locale, Translator } from '@kitchen/i18n';
import { expiryStatus } from './expiry';
import { formatDaysLeft, formatMeasure, locationLabel, type NumeralPrefs } from './format';

export type InventoryRowBadgeTone = 'muted' | 'success' | 'warn' | 'danger' | 'primary';

type InventoryRowItem = Pick<InventoryItem, 'expiresAt' | 'label' | 'quantity'> & {
  unit: Unit;
  ingredient: Pick<Ingredient, 'canonicalNameEn' | 'canonicalNameAr' | 'category'>;
};

type InventoryRowLocation = Pick<StorageLocation, 'name' | 'type'>;

export function homeInventoryExpiryBadge(
  t: Translator,
  item: Pick<InventoryItem, 'expiresAt'>,
  now: Date = new Date(),
): { label: string; tone: InventoryRowBadgeTone } | null {
  const status = expiryStatus(item.expiresAt, now);
  if (status === 'expired' || status === 'today') {
    return { label: t('mobile.home.statExpiring'), tone: 'danger' };
  }
  if (status === 'soon') return { label: t('mobile.home.statExpiring'), tone: 'warn' };
  if (status === 'ok') return { label: t('mobile.home.freshOk'), tone: 'success' };
  return null;
}

export function homeInventoryItemMeta(
  t: Translator,
  locale: Locale,
  item: Pick<InventoryRowItem, 'quantity' | 'unit'>,
  location: InventoryRowLocation | undefined,
  prefs: NumeralPrefs = {},
): string {
  const quantity = formatMeasure(t, locale, item.quantity, item.unit, prefs);
  const place = location ? locationLabel(t, location) : t('common.loading');
  return `${quantity} · ${place}`;
}

export function homeInventoryItemWhen(
  t: Translator,
  locale: Locale,
  item: Pick<InventoryItem, 'expiresAt'>,
  prefs: NumeralPrefs = {},
  now: Date = new Date(),
): string | null {
  return formatDaysLeft(t, locale, item.expiresAt, prefs, now);
}

export function homeInventoryItemFoodIcon(item: InventoryRowItem) {
  return {
    label: item.label,
    nameEn: item.ingredient.canonicalNameEn,
    nameAr: item.ingredient.canonicalNameAr,
    category: item.ingredient.category,
  };
}
