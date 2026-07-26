import { describe, expect, it } from 'vitest';
import { ARABIC_FONTS, arabicFontFamily, resolveFontFamily } from './fonts';

describe('arabicFontFamily', () => {
  it('maps each weight to its own vendored cut', () => {
    expect(arabicFontFamily('700')).toBe(ARABIC_FONTS.bold);
    expect(arabicFontFamily('600')).toBe(ARABIC_FONTS.semibold);
    expect(arabicFontFamily('500')).toBe(ARABIC_FONTS.medium);
    expect(arabicFontFamily('400')).toBe(ARABIC_FONTS.regular);
  });

  it('uses the PostScript names the .ttf files self-report', () => {
    expect(ARABIC_FONTS.bold).toBe('IBMPlexSansArabic-Bold');
    expect(ARABIC_FONTS.semibold).toBe('IBMPlexSansArabic-SemiBold');
    expect(ARABIC_FONTS.medium).toBe('IBMPlexSansArabic-Medium');
    expect(ARABIC_FONTS.regular).toBe('IBMPlexSansArabic-Regular');
  });
});

describe('resolveFontFamily', () => {
  it('returns the weight-specific Arabic face for ar once fonts are loaded', () => {
    expect(resolveFontFamily('ar', true, '700')).toBe('IBMPlexSansArabic-Bold');
    expect(resolveFontFamily('ar', true, '400')).toBe('IBMPlexSansArabic-Regular');
    expect(resolveFontFamily('ar', true)).toBe('IBMPlexSansArabic-Regular');
  });

  it('falls back to the system font for ar until the face has loaded', () => {
    expect(resolveFontFamily('ar', false, '700')).toBeUndefined();
  });

  it('never overrides the system font for Latin locales', () => {
    expect(resolveFontFamily('en', true, '700')).toBeUndefined();
    expect(resolveFontFamily('en', false, '400')).toBeUndefined();
  });
});
