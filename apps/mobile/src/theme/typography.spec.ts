import { describe, expect, it } from 'vitest';
import { maxFontScaleFor, typography } from './index';

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

describe('typography line height', () => {
  it('leaves lineHeight unscaled, because React Native already scales it', () => {
    // RN 0.86 scales an absolute lineHeight along with fontSize. Multiplying it by
    // the font scale here would scale it twice: verified on the simulator at the
    // maximum accessibility text size, where it pushed the whole sign-in form off
    // screen. AppText caps growth with maxFontSizeMultiplier instead.
    expect(typography('en').body.lineHeight).toBe(Math.round(16 * 1.35));
    expect(typography('ar').body.lineHeight).toBe(Math.round(16 * 1.7));
  });
});

describe('maxFontScaleFor', () => {
  it('caps the chrome variants', () => {
    expect(maxFontScaleFor('button')).toBe(1.6);
    expect(maxFontScaleFor('label')).toBe(1.6);
    expect(maxFontScaleFor('caption')).toBe(1.6);
  });

  it('leaves the content variants uncapped', () => {
    // undefined rather than Infinity: this value is handed to React Native's
    // maxFontSizeMultiplier prop, which accepts null, 0, or a number >= 1.
    for (const variant of ['display', 'title', 'heading', 'body', 'bodyStrong'] as const) {
      expect(maxFontScaleFor(variant), variant).toBeUndefined();
    }
  });

  it('classifies every variant in the scale', () => {
    // Adding a variant without deciding whether it is chrome or content would
    // silently default it to uncapped. Fail here instead.
    expect(Object.keys(typography('en')).sort()).toEqual(
      ['body', 'bodyStrong', 'button', 'caption', 'display', 'heading', 'label', 'title'],
    );
  });
});
