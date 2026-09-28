import { describe, expect, it } from 'vitest';
import type { Ingredient, Unit } from '@kitchen/contracts';
import { createTranslator } from '@kitchen/i18n';
import { formatMeasure } from './format';
import {
  addFieldAction,
  formatShoppingListForShare,
  type ShoppingShareItem,
} from './shopping-share';

const items: ShoppingShareItem[] = [
  {
    nameEn: 'Lemons',
    nameAr: 'ليمون',
    quantity: 3,
    unit: 'piece',
    purchased: false,
  },
  {
    nameEn: 'Flour',
    nameAr: 'دقيق',
    quantity: 1,
    unit: 'kg',
    purchased: true,
  },
  {
    nameEn: 'Milk',
    nameAr: 'حليب',
    quantity: 2,
    unit: 'l',
    purchased: false,
  },
];

function measure(locale: 'en' | 'ar') {
  const t = createTranslator(locale);
  return (quantity: number, unit: Unit) => formatMeasure(t, locale, quantity, unit);
}

function ingredient(id: string): Ingredient {
  return {
    id,
    canonicalNameEn: 'Lemon',
    canonicalNameAr: 'ليمون',
    category: 'fruit',
    defaultUnit: 'piece',
    aliases: [],
    isStaple: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('formatShoppingListForShare', () => {
  it('formats English unpurchased items in list order', () => {
    expect(formatShoppingListForShare(items, 'en', measure('en'))).toBe('Lemons 3 pc\nMilk 2 L');
  });

  it('formats Arabic names and unit words', () => {
    expect(formatShoppingListForShare(items, 'ar', measure('ar'))).toBe('ليمون 3 قطعة\nحليب 2 لتر');
  });

  it('returns an empty message when everything is purchased', () => {
    expect(
      formatShoppingListForShare(
        items.map((item) => ({ ...item, purchased: true })),
        'en',
        measure('en'),
      ),
    ).toBe('');
  });
});

describe('addFieldAction', () => {
  it('enables the add button only when a non-empty search has exactly one result', () => {
    const lemon = ingredient('00000000-0000-4000-8000-000000000001');
    expect(addFieldAction('lem', [lemon])).toEqual({ enabled: true, ingredient: lemon });
  });

  it('disables the add button for empty, missing and ambiguous catalog matches', () => {
    const lemon = ingredient('00000000-0000-4000-8000-000000000001');
    const lime = ingredient('00000000-0000-4000-8000-000000000002');
    expect(addFieldAction('', [lemon])).toEqual({ enabled: false, ingredient: null });
    expect(addFieldAction('lem', [])).toEqual({ enabled: false, ingredient: null });
    expect(addFieldAction('l', [lemon, lime])).toEqual({ enabled: false, ingredient: null });
  });
});
