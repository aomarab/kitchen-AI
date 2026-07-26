import { create } from 'zustand';
import type { Locale } from '@kitchen/i18n';
import type { TextStyleToken } from '../theme';

/**
 * IBM Plex Sans Arabic — mandated for Arabic typography by spec §7.
 *
 * The four weights are vendored under `apps/mobile/assets/fonts/` and ship inside
 * the app, so there is no CDN dependency and no first-launch network fetch. See
 * `apps/mobile/assets/fonts/README.md` for provenance and licence (SIL Open Font
 * License 1.1; sourced from `google/fonts`, pinned at commit
 * 702964cf46bd1bf33d0745d24bbaac33edf8b8af, version 1.101).
 *
 * Each face is registered under a key equal to its PostScript name (verified by
 * parsing the TTF `name` tables: `IBMPlexSansArabic-Regular` / `-Medium` /
 * `-SemiBold` / `-Bold`), so the family we reference always resolves to the real
 * weight-specific cut rather than silently falling back to the system font. The
 * native loading lives in `lib/font-loader.ts`; this module stays free of native
 * imports so the family-resolution helpers below remain unit-testable.
 */
export const ARABIC_FONTS = {
  regular: 'IBMPlexSansArabic-Regular',
  medium: 'IBMPlexSansArabic-Medium',
  semibold: 'IBMPlexSansArabic-SemiBold',
  bold: 'IBMPlexSansArabic-Bold',
} as const;

interface FontState {
  loaded: boolean;
  setLoaded: (loaded: boolean) => void;
}

/** Published so any text primitive can react when the Arabic font finishes loading. */
export const useFontStore = create<FontState>((set) => ({
  loaded: false,
  setLoaded: (loaded) => set((prev) => (prev.loaded === loaded ? prev : { loaded })),
}));

/** Pick the weight-specific Arabic family so iOS renders the correct cut. */
export function arabicFontFamily(weight: TextStyleToken['fontWeight']): string {
  switch (weight) {
    case '700':
      return ARABIC_FONTS.bold;
    case '600':
      return ARABIC_FONTS.semibold;
    case '500':
      return ARABIC_FONTS.medium;
    default:
      return ARABIC_FONTS.regular;
  }
}

/**
 * The font family to apply for a given locale/weight, or `undefined` to use the
 * system font (Latin, or Arabic before the custom font has loaded).
 */
export function resolveFontFamily(
  locale: Locale,
  fontsLoaded: boolean,
  weight: TextStyleToken['fontWeight'] = '400',
): string | undefined {
  if (locale === 'ar' && fontsLoaded) return arabicFontFamily(weight);
  return undefined;
}
