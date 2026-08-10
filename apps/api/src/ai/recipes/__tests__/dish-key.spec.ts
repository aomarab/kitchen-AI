import { describe, expect, it } from 'vitest';
import { dishKey, normalizeTokens } from '../dish-key.js';

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
