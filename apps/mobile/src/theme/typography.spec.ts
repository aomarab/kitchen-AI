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

describe('typography under font scaling', () => {
  it('is unchanged at the default scale', () => {
    // The regression guard for the entire device-compatibility change: a phone
    // at the default text size must render exactly as it did before scaling
    // existed. If this fails, the change is visible on every screen.
    expect(typography('en', 1)).toEqual(typography('en'));
    expect(typography('en').body.lineHeight).toBe(Math.round(16 * 1.35));
    expect(typography('ar').body.lineHeight).toBe(Math.round(16 * 1.7));
  });

  it('grows the line box with the text', () => {
    // React Native scales fontSize by the system font scale but does NOT scale
    // an absolute lineHeight, so the line box must be pre-multiplied here or
    // large text is clipped by a box sized for small text.
    expect(typography('en', 2).body.lineHeight).toBe(Math.round(16 * 2 * 1.35));
    expect(typography('en', 1.5).heading.lineHeight).toBe(Math.round(18 * 1.5 * 1.35));
  });

  it('caps chrome so pills and labels cannot explode', () => {
    // iOS reaches ~3.1x at the largest accessibility sizes. A button label at
    // 3.1x breaks every row in the app, so chrome stops at 1.6x.
    expect(typography('en', 3.1).button.lineHeight).toBe(Math.round(16 * 1.6 * 1.35));
    expect(typography('en', 3.1).label.lineHeight).toBe(Math.round(14 * 1.6 * 1.35));
    expect(typography('en', 3.1).caption.lineHeight).toBe(Math.round(12 * 1.6 * 1.35));
  });

  it('leaves content uncapped so long-form text honours the setting fully', () => {
    expect(typography('en', 3.1).body.lineHeight).toBe(Math.round(16 * 3.1 * 1.35));
    expect(typography('en', 3.1).display.lineHeight).toBe(Math.round(28 * 3.1 * 1.35));
  });

  it('keeps the Arabic factor at every scale', () => {
    expect(typography('ar', 2).body.lineHeight).toBe(Math.round(16 * 2 * 1.7));
    expect(typography('ar', 2).body.lineHeight).toBeGreaterThan(
      typography('en', 2).body.lineHeight,
    );
  });

  it('never letter-spaces Arabic at any scale', () => {
    for (const [variant, token] of Object.entries(typography('ar', 3.1))) {
      expect(token.letterSpacing, variant).toBe(0);
    }
  });

  it('shrinks the line box when the user reduces text size', () => {
    expect(typography('en', 0.85).body.lineHeight).toBe(Math.round(16 * 0.85 * 1.35));
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
