import { describe, expect, it } from 'vitest';
import {
  ARABIC_FONTS,
  LATIN_FONTS,
  NUMERAL_FONT,
  arabicFontFamily,
  latinFontFamily,
  resolveFontFamily,
} from './fonts';

describe('ARABIC_FONTS', () => {
  it('uses the PostScript names the .ttf files self-report', () => {
    expect(ARABIC_FONTS.bold).toBe('Tajawal-Bold');
    expect(ARABIC_FONTS.medium).toBe('Tajawal-Medium');
    expect(ARABIC_FONTS.regular).toBe('Tajawal-Regular');
  });

  it('declares only cuts Tajawal actually ships — it has no semibold', () => {
    expect(Object.keys(ARABIC_FONTS).sort()).toEqual(['bold', 'medium', 'regular']);
  });
});

describe('LATIN_FONTS', () => {
  it('maps Latin text to Tajawal for the Coral redesign', () => {
    expect(LATIN_FONTS.regular).toBe('Tajawal-Regular');
    expect(LATIN_FONTS.medium).toBe('Tajawal-Medium');
    expect(LATIN_FONTS.semibold).toBe('Tajawal-Bold');
    expect(LATIN_FONTS.bold).toBe('Tajawal-Bold');
  });
});

describe('latinFontFamily', () => {
  it('uses Tajawal for every text weight and promotes 600 to Bold', () => {
    const cuts = (['400', '500', '600', '700'] as const).map(latinFontFamily);
    expect(cuts).toEqual([
      LATIN_FONTS.regular,
      LATIN_FONTS.medium,
      LATIN_FONTS.bold,
      LATIN_FONTS.bold,
    ]);
    expect(new Set(cuts).size).toBe(3);
  });
});

describe('arabicFontFamily', () => {
  it('maps each weight to its own vendored cut', () => {
    expect(arabicFontFamily('700')).toBe(ARABIC_FONTS.bold);
    expect(arabicFontFamily('500')).toBe(ARABIC_FONTS.medium);
    expect(arabicFontFamily('400')).toBe(ARABIC_FONTS.regular);
  });

  it('promotes the 600 tier to Bold, since Tajawal ships no 600 cut', () => {
    expect(arabicFontFamily('600')).toBe(ARABIC_FONTS.bold);
  });
});

describe('resolveFontFamily', () => {
  it('declares Outfit Medium as the only numeral face', () => {
    expect(NUMERAL_FONT).toBe('Outfit-Medium');
  });

  it('returns the weight-specific Arabic face for ar once fonts are loaded', () => {
    expect(resolveFontFamily('ar', true, '700')).toBe('Tajawal-Bold');
    expect(resolveFontFamily('ar', true, '400')).toBe('Tajawal-Regular');
    expect(resolveFontFamily('ar', true)).toBe('Tajawal-Regular');
  });

  it('falls back to the system font for ar until the face has loaded', () => {
    expect(resolveFontFamily('ar', false, '700')).toBeUndefined();
  });

  it('returns the weight-specific Tajawal face for Latin once fonts are loaded', () => {
    expect(resolveFontFamily('en', true, '400')).toBe('Tajawal-Regular');
    expect(resolveFontFamily('en', true, '500')).toBe('Tajawal-Medium');
    expect(resolveFontFamily('en', true, '600')).toBe('Tajawal-Bold');
    expect(resolveFontFamily('en', true, '700')).toBe('Tajawal-Bold');
    expect(resolveFontFamily('en', true)).toBe('Tajawal-Regular');
  });

  it('falls back to the system font for Latin until the faces have loaded', () => {
    expect(resolveFontFamily('en', false, '700')).toBeUndefined();
  });

  it('uses Outfit Medium for numeral variants in both locales', () => {
    expect(resolveFontFamily('en', true, '500', 'numeral')).toBe(NUMERAL_FONT);
    expect(resolveFontFamily('en', true, '500', 'numeralSmall')).toBe(NUMERAL_FONT);
    expect(resolveFontFamily('ar', true, '500', 'numeral')).toBe(NUMERAL_FONT);
    expect(resolveFontFamily('ar', true, '500', 'numeralSmall')).toBe(NUMERAL_FONT);
  });

  it('falls back to the system font for numerals until Outfit Medium has loaded', () => {
    expect(resolveFontFamily('en', false, '500', 'numeral')).toBeUndefined();
    expect(resolveFontFamily('ar', false, '500', 'numeralSmall')).toBeUndefined();
  });
});
