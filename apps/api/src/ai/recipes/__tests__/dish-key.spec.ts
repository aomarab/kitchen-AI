import { describe, expect, it } from 'vitest';
import { dishKey, normalizeTokens, GENERIC_TOKENS } from '../dish-key.js';

describe('dishKey', () => {
  it('lowercases and joins content tokens', () => {
    expect(dishKey('Chicken Kabsa')).toBe('chicken-kabsa');
  });

  it('is insensitive to word order, so one dish is one key', () => {
    expect(dishKey('Kabsa Chicken')).toBe(dishKey('Chicken Kabsa'));
  });

  it('drops generic recipe words', () => {
    expect(dishKey('The Best Chicken Kabsa Recipe')).toBe('chicken-kabsa');
  });

  it('drops punctuation', () => {
    expect(dishKey('Chicken Kabsa!! (authentic)')).toBe('chicken-kabsa');
  });

  it('strips Arabic tashkeel and tatweel', () => {
    expect(dishKey('كَبْسَة دَجَاج')).toBe(dishKey('كبسة دجاج'));
  });

  it('folds ta marbuta so كبسة and كبسه agree', () => {
    expect(dishKey('كبسة دجاج')).toBe(dishKey('كبسه دجاج'));
  });

  it('folds alef variants', () => {
    expect(dishKey('أرز بالخلطة')).toBe(dishKey('ارز بالخلطة'));
  });

  it('drops generic Arabic recipe words', () => {
    expect(dishKey('طريقة عمل كبسة دجاج')).toBe(dishKey('كبسة دجاج'));
  });

  it('folds and drops ألذ (tastiest), a common superlative in recipe titles', () => {
    expect(dishKey('ألذ كبسة دجاج')).toBe(dishKey('كبسة دجاج'));
  });

  it('gives different keys to the two locales, which is why locale is a separate column', () => {
    expect(dishKey('Chicken Kabsa')).not.toBe(dishKey('كبسة دجاج'));
  });

  it('returns an empty string when a title is entirely generic', () => {
    expect(dishKey('easy quick recipe')).toBe('');
  });
});

describe('normalizeTokens', () => {
  it('returns content tokens without generic words', () => {
    expect(normalizeTokens('The Best Chicken Kabsa Recipe').sort()).toEqual(['chicken', 'kabsa']);
  });
});

describe('GENERIC_TOKENS invariant', () => {
  it('every token is already in its folded form (folding is a no-op)', () => {
    const unfolded: string[] = [];
    for (const token of GENERIC_TOKENS) {
      const result = normalizeTokens(token);
      if (result.length > 0) {
        unfolded.push(token);
      }
    }
    if (unfolded.length > 0) {
      expect.fail(`These tokens are not yet folded and survive normalizeTokens (generic filtering fails): ${unfolded.join(', ')}`);
    }
    expect(unfolded.length).toBe(0);
  });
});
