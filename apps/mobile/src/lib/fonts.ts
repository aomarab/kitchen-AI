import { create } from 'zustand';
import type { Locale } from '@kitchen/i18n';
import type { TextStyleToken } from '../theme';

/**
 * Tajawal — mandated for Arabic typography by spec §7.
 *
 * The three weights are vendored under `apps/mobile/assets/fonts/` and ship inside
 * the app, so there is no CDN dependency and no first-launch network fetch. See
 * `apps/mobile/assets/fonts/README.md` for provenance and licence (SIL Open Font
 * License 1.1; sourced from `google/fonts`, pinned at commit
 * 7ff85c87f93ea6cca5f41c69f2e4edcb90240f26, version 1.700).
 *
 * Each face is registered under a key equal to its PostScript name (verified by
 * parsing the TTF `name` tables: `Tajawal-Regular` / `-Medium` / `-Bold`), so the
 * family we reference always resolves to the real weight-specific cut rather than
 * silently falling back to the system font. The native loading lives in
 * `lib/font-loader.ts`; this module stays free of native imports so the
 * family-resolution helpers below remain unit-testable.
 *
 * Tajawal ships no semibold: its weights run 200, 300, 400, 500, 700, 800, 900.
 * The type scale's 600 tier is therefore promoted to Bold — see `arabicFontFamily`.
 */
export const ARABIC_FONTS = {
  regular: 'Tajawal-Regular',
  medium: 'Tajawal-Medium',
  bold: 'Tajawal-Bold',
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

/**
 * Pick the weight-specific Arabic family so iOS renders the correct cut.
 *
 * The 600 tier resolves to Bold because Tajawal ships no semibold. React Native
 * does no nearest-weight matching of its own, so naming a face that is not
 * registered would drop the text to the system font with no warning.
 */
export function arabicFontFamily(weight: TextStyleToken['fontWeight']): string {
  switch (weight) {
    case '700':
    case '600':
      return ARABIC_FONTS.bold;
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
