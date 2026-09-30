import { describe, expect, it } from 'vitest';
import { maxFontScaleFor, typography } from './index';

describe('typography', () => {
  it('uses the J type scale values in Latin', () => {
    const en = typography('en');
    expect(en.hero).toMatchObject({
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '500',
      letterSpacing: -0.4,
    });
    expect(en.display).toMatchObject({
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '500',
      letterSpacing: -0.3,
    });
    expect(en.title).toMatchObject({
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '500',
      letterSpacing: -0.2,
    });
    expect(en.body).toMatchObject({
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '400',
      letterSpacing: 0,
    });
    expect(en.button).toMatchObject({
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      letterSpacing: 0.1,
    });
  });

  it('never letter-spaces Arabic', () => {
    // Arabic is cursive: letter-spacing forces gaps into the letter joins.
    for (const [variant, token] of Object.entries(typography('ar'))) {
      expect(token.letterSpacing, variant).toBe(0);
    }
  });

  it('uses explicit Arabic sizes and line heights', () => {
    const ar = typography('ar');
    expect(ar.hero).toMatchObject({ fontSize: 30, lineHeight: 44, fontWeight: '500' });
    expect(ar.display).toMatchObject({ fontSize: 26, lineHeight: 38, fontWeight: '500' });
    expect(ar.body).toMatchObject({ fontSize: 15, lineHeight: 26, fontWeight: '400' });
    expect(ar.button).toMatchObject({ fontSize: 15, lineHeight: 22, fontWeight: '700' });
  });

  it('adds the six J variants', () => {
    const en = typography('en');
    expect(en.bodyLarge).toMatchObject({ fontSize: 17, lineHeight: 27, fontWeight: '400' });
    expect(en.small).toMatchObject({ fontSize: 12, lineHeight: 16, fontWeight: '400' });
    expect(en.eyebrow).toMatchObject({ fontSize: 12, lineHeight: 16, fontWeight: '700' });
    expect(en.buttonSmall).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: '700' });
    expect(en.numeralSmall).toMatchObject({ fontSize: 28, lineHeight: 32, fontWeight: '500' });
    expect(en.tab).toMatchObject({ fontSize: 11, lineHeight: 14, fontWeight: '500' });
  });

  /**
   * Tile counts, the credit balance and the cook timer change digit by digit.
   * Proportional figures make the number shuffle sideways as it ticks.
   */
  it('sets numerals in tabular figures, in both locales', () => {
    expect(typography('en').numeral.fontVariant).toEqual(['tabular-nums']);
    expect(typography('en').numeralSmall.fontVariant).toEqual(['tabular-nums']);
    expect(typography('ar').numeral.fontVariant).toEqual(['tabular-nums']);
    expect(typography('ar').numeralSmall.fontVariant).toEqual(['tabular-nums']);
    expect(typography('en').body.fontVariant).toBeUndefined();
  });
});

describe('typography line height', () => {
  it('uses explicit line heights rather than a shared multiplier', () => {
    // RN 0.86 scales an absolute lineHeight along with fontSize. Multiplying it by
    // the font scale here would scale it twice: verified on the simulator at the
    // maximum accessibility text size, where it pushed the whole sign-in form off
    // screen. AppText caps growth with maxFontSizeMultiplier instead.
    expect(typography('en').body.lineHeight).toBe(22);
    expect(typography('ar').body.lineHeight).toBe(26);
  });
});

describe('maxFontScaleFor', () => {
  it('caps the chrome variants', () => {
    expect(maxFontScaleFor('button')).toBe(1.6);
    expect(maxFontScaleFor('buttonSmall')).toBe(1.6);
    expect(maxFontScaleFor('label')).toBe(1.6);
    expect(maxFontScaleFor('caption')).toBe(1.6);
    expect(maxFontScaleFor('small')).toBe(1.6);
    expect(maxFontScaleFor('eyebrow')).toBe(1.6);
    expect(maxFontScaleFor('tab')).toBe(1.6);
  });

  it('leaves the content variants uncapped', () => {
    // undefined rather than Infinity: this value is handed to React Native's
    // maxFontSizeMultiplier prop, which accepts null, 0, or a number >= 1.
    for (const variant of [
      'hero',
      'display',
      'title',
      'heading',
      'bodyLarge',
      'body',
      'bodyStrong',
      'numeral',
      'numeralSmall',
    ] as const) {
      expect(maxFontScaleFor(variant), variant).toBeUndefined();
    }
  });

  it('classifies every variant in the scale', () => {
    // Adding a variant without deciding whether it is chrome or content would
    // silently default it to uncapped. Fail here instead.
    expect(Object.keys(typography('en')).sort()).toEqual([
      'body',
      'bodyLarge',
      'bodyStrong',
      'button',
      'buttonSmall',
      'caption',
      'display',
      'eyebrow',
      'heading',
      'hero',
      'label',
      'numeral',
      'numeralSmall',
      'small',
      'tab',
      'title',
    ]);
  });
});
