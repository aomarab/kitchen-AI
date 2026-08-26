import { describe, expect, it } from 'vitest';
import { ingredientCategorySchema } from '@kitchen/contracts';
import { allIconKeys, foodIconKey } from './food-icon';

describe('foodIconKey — name first, category second', () => {
  it('reads the item name, because category is too coarse to tell food apart', () => {
    expect(foodIconKey({ nameEn: 'Sliced bread', category: 'bread' })).toBe('bread');
    expect(foodIconKey({ nameEn: 'Shredded cheddar cheese', category: 'dairy' })).toBe('cheese');
    expect(foodIconKey({ nameEn: 'Butter block', category: 'dairy' })).toBe('butter');
  });

  it('rescues packaged food the catalog can only call "other"', () => {
    // The real shelf that prompted this: every one of these was a bare box.
    expect(foodIconKey({ nameEn: 'Bounty chocolate bars (coconut filling)', category: 'other' })).toBe('chocolate');
    expect(foodIconKey({ nameEn: 'Whole round cake (store-bought)', category: 'other' })).toBe('cake');
    expect(foodIconKey({ nameEn: 'Almarai chocolate pudding cups', category: 'other' })).toBe('pudding');
    expect(foodIconKey({ nameEn: 'Wrapped dessert or pastry (plastic-wrapped)', category: 'other' })).toBe('croissant');
  });

  it('matches Arabic names, since that is what an Arabic reader sees', () => {
    expect(foodIconKey({ nameAr: 'طماطم', category: 'other' })).toBe('tomato');
    expect(foodIconKey({ nameAr: 'زبادي يوناني', category: 'other' })).toBe('milk');
    expect(foodIconKey({ nameAr: 'خبز عربي', category: 'other' })).toBe('bread');
  });

  it('ignores diacritics and alef spelling, which readers treat as the same word', () => {
    expect(foodIconKey({ nameAr: 'أرز', category: 'other' })).toBe('rice');
    expect(foodIconKey({ nameAr: 'ارز', category: 'other' })).toBe('rice');
    expect(foodIconKey({ nameAr: 'جُبْنَة', category: 'other' })).toBe('cheese');
  });

  it("prefers the household's own label, which is the name actually on screen", () => {
    expect(
      foodIconKey({ label: 'Birthday cake', nameEn: 'Almarai chocolate pudding cups', category: 'dairy' }),
    ).toBe('cake');
  });

  it('resolves the more specific reading when two rules could match', () => {
    expect(foodIconKey({ nameEn: 'Chocolate cake', category: 'other' })).toBe('cake');
  });

  it('falls back to the category when the name says nothing recognisable', () => {
    expect(foodIconKey({ nameEn: 'Almarai product 402', category: 'dairy' })).toBe('milk');
    expect(foodIconKey({ nameEn: 'Unlabelled jar', category: 'other' })).toBe('basket');
  });

  it('always returns something, for every category the contract can send', () => {
    for (const category of ingredientCategorySchema.options) {
      expect(foodIconKey({ category }), category).toBeTruthy();
    }
  });
});

describe('allIconKeys', () => {
  it('lists every key without duplicates', () => {
    const keys = allIconKeys();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('basket');
  });
});
