import type { InventoryItem, StorageLocation } from '@kitchen/contracts';
import type { Translator } from '@kitchen/i18n';
import { describe, expect, it } from 'vitest';
import {
  inventoryItemRowBadge,
  inventoryItemRowFoodIcon,
  inventoryItemRowMeta,
  inventoryItemRowWhen,
} from './inventory-row';

const t: Translator = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'mobile.home.statExpiring') return 'Expiring';
  if (key === 'mobile.home.freshOk') return 'Fresh';
  if (key === 'inventory.locations.fridge') return 'Fridge';
  if (key === 'inventory.expired') return 'Expired';
  if (key === 'mobile.kitchen.leftToday') return 'Today';
  if (key === 'mobile.kitchen.daysLeft') return `${String(params?.days)} left`;
  if (key === 'units.kg') return 'kg';
  return key;
}) as Translator;

const item = {
  label: 'Yogurt',
  quantity: 0.8,
  unit: 'kg',
  expiresAt: '2026-09-30',
  ingredient: {
    canonicalNameEn: 'Yogurt',
    canonicalNameAr: 'لبن',
    category: 'dairy',
  },
} as InventoryItem;

const location = {
  name: 'Fridge',
  type: 'fridge',
} as StorageLocation;

describe('inventory row helpers', () => {
  it('builds the shared item-row meta line from quantity and location', () => {
    expect(inventoryItemRowMeta(t, 'en', item, { location })).toBe('0.8 kg · Fridge');
  });

  it('can omit location when a place filter already says where the rows live', () => {
    expect(inventoryItemRowMeta(t, 'en', item, { location, includeLocation: false })).toBe(
      '0.8 kg',
    );
  });

  it('maps expiry into worded badge status and compact timing', () => {
    expect(inventoryItemRowBadge(t, item, new Date('2026-09-29T12:00:00Z'))).toEqual({
      label: 'Expiring',
      tone: 'warn',
    });
    expect(inventoryItemRowWhen(t, 'en', item, {}, new Date('2026-09-29T12:00:00Z'))).toBe(
      '1 left',
    );
  });

  it('keeps the food art item-driven instead of Home-specific', () => {
    expect(inventoryItemRowFoodIcon(item)).toEqual({
      label: 'Yogurt',
      nameEn: 'Yogurt',
      nameAr: 'لبن',
      category: 'dairy',
    });
  });
});
