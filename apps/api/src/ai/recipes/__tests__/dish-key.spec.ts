import { describe, expect, it } from 'vitest';
import { dishKey, GENERIC_TOKENS } from '../dish-key.js';

describe('dishKey', () => {
  it('strips Arabic tashkeel', () => {
    expect(dishKey('كَبْسَة دَجَاج', 'ar')).toBe(dishKey('كبسة دجاج', 'ar'));
    expect(dishKey('كَبْسَة دَجَاج', 'ar')).toBe('ar:دجاج-كبسه');
  });

  it('folds Arabic alef, ta marbuta and alef maqsura variants', () => {
    expect(dishKey('أكلة على', 'ar')).toBe(dishKey('اكله علي', 'ar'));
    expect(dishKey('أكلة على', 'ar')).toBe('ar:اكله-علي');
  });

  it('treats token order as irrelevant', () => {
    expect(dishKey('kabsa chicken', 'en')).toBe(dishKey('Chicken Kabsa', 'en'));
    expect(dishKey('kabsa chicken', 'en')).toBe('en:chicken-kabsa');
  });

  it('drops English articles and generic recipe words', () => {
    expect(dishKey('The best easy homemade chicken kabsa recipe', 'en')).toBe('en:chicken-kabsa');
  });

  it('drops Arabic generic recipe words after locale-specific folding', () => {
    expect(dishKey('ألذ وصفة طريقة عمل كبسة دجاج بالبيت', 'ar')).toBe('ar:دجاج-كبسه');
  });

  it('strips the Arabic definite article from every token, not just the first', () => {
    // The article is a bound prefix on each noun and adjective in a definite
    // phrase, so a definite and an indefinite spelling of one dish must collapse
    // to a single key — otherwise every household re-pays for the same search.
    expect(dishKey('الدجاج المشوي', 'ar')).toBe(dishKey('دجاج مشوي', 'ar'));
    expect(dishKey('الدجاج المشوي', 'ar')).toBe('ar:دجاج-مشوي');
    expect(dishKey('كبسة الدجاج', 'ar')).toBe(dishKey('كبسة دجاج', 'ar'));
  });

  it('keeps short roots that merely begin with alef-lam', () => {
    // ألذ normalizes to الذ. Stripping that would leave a single letter that no
    // longer matches its entry in the generic list, leaking noise into the key.
    expect(dishKey('ألذ كبسة', 'ar')).toBe('ar:كبسه');
    expect(dishKey('أفضل وصفة كبسة', 'ar')).toBe('ar:كبسه');
    expect(dishKey('الرز البخاري', 'ar')).toBe('ar:بخاري-رز');
  });

  it('keeps media keys separate per locale', () => {
    expect(dishKey('Chicken Kabsa', 'en')).toBe('en:chicken-kabsa');
    expect(dishKey('كبسة دجاج', 'ar')).toBe('ar:دجاج-كبسه');
    expect(dishKey('Chicken Kabsa', 'en')).not.toBe(dishKey('كبسة دجاج', 'ar'));
  });

  it('exports the scorer generic token list', () => {
    expect(GENERIC_TOKENS).toContain('recipe');
    expect(GENERIC_TOKENS).toContain('طريقة');
  });
});
