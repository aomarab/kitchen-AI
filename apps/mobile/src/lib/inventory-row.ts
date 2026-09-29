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

export interface InventoryRowMetaOptions {
  location?: InventoryRowLocation;
  brand?: string | null;
  includeLocation?: boolean;
  prefs?: NumeralPrefs;
}

export function inventoryItemRowBadge(
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

export function inventoryItemRowMeta(
  t: Translator,
  locale: Locale,
  item: Pick<InventoryRowItem, 'quantity' | 'unit'>,
  { location, brand, includeLocation = true, prefs = {} }: InventoryRowMetaOptions = {},
): string {
  const quantity = formatMeasure(t, locale, item.quantity, item.unit, prefs);
  const details = [quantity];
  if (includeLocation) details.push(location ? locationLabel(t, location) : t('common.loading'));
  else if (brand) details.push(brand);
  return details.join(' · ');
}

export function inventoryItemRowWhen(
  t: Translator,
  locale: Locale,
  item: Pick<InventoryItem, 'expiresAt'>,
  prefs: NumeralPrefs = {},
  now: Date = new Date(),
): string | null {
  return formatDaysLeft(t, locale, item.expiresAt, prefs, now);
}

export function inventoryItemRowFoodIcon(item: InventoryRowItem) {
  return {
    label: item.label,
    nameEn: item.ingredient.canonicalNameEn,
    nameAr: item.ingredient.canonicalNameAr,
    category: item.ingredient.category,
  };
}
