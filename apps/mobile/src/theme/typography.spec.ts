import { describe, expect, it } from 'vitest';
import { typography } from './index';

describe('typography', () => {
  it('tightens large Latin tiers and opens up small ones', () => {
    const en = typography('en');
    expect(en.display.letterSpacing).toBeLessThan(0);
    expect(en.title.letterSpacing).toBeLessThan(0);
    expect(en.button.letterSpacing).toBeGreaterThan(0);
    expect(en.body.letterSpacing).toBe(0);
  });

  it('never letter-spaces Arabic', () => {
    // Arabic is cursive: letter-spacing forces gaps into the letter joins.
    for (const [variant, token] of Object.entries(typography('ar'))) {
      expect(token.letterSpacing, variant).toBe(0);
    }
  });

  it('gives Arabic more leading at the same size', () => {
    expect(typography('ar').body.fontSize).toBe(typography('en').body.fontSize);
    expect(typography('ar').body.lineHeight).toBeGreaterThan(typography('en').body.lineHeight);
  });

  it('carries a 700-weight button tier for pill labels', () => {
    expect(typography('en').button.fontWeight).toBe('700');
    expect(typography('en').button.fontSize).toBe(16);
  });
});
