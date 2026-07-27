import { describe, expect, it } from 'vitest';
import { ARABIC_FONTS, arabicFontFamily, resolveFontFamily } from './fonts';

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
  it('returns the weight-specific Arabic face for ar once fonts are loaded', () => {
    expect(resolveFontFamily('ar', true, '700')).toBe('Tajawal-Bold');
    expect(resolveFontFamily('ar', true, '400')).toBe('Tajawal-Regular');
    expect(resolveFontFamily('ar', true)).toBe('Tajawal-Regular');
  });

  it('falls back to the system font for ar until the face has loaded', () => {
    expect(resolveFontFamily('ar', false, '700')).toBeUndefined();
  });

  it('never overrides the system font for Latin locales', () => {
    expect(resolveFontFamily('en', true, '700')).toBeUndefined();
    expect(resolveFontFamily('en', false, '400')).toBeUndefined();
  });
});
