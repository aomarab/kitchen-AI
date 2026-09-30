import { create } from 'zustand';
import type { Locale } from '@kitchen/i18n';
import type { TextStyleToken, TypographyVariant } from '../theme';

/**
 * Coral uses Tajawal for text in both scripts (mobile Coral redesign spec §6).
 * Numeral tiers use Outfit Medium because it provides tabular figures.
 */
export const ARABIC_FONTS = {
  regular: 'Tajawal-Regular',
  medium: 'Tajawal-Medium',
  bold: 'Tajawal-Bold',
} as const;

export const LATIN_FONTS = {
  regular: ARABIC_FONTS.regular,
  medium: ARABIC_FONTS.medium,
  semibold: ARABIC_FONTS.bold,
  bold: ARABIC_FONTS.bold,
} as const;

export const NUMERAL_FONT = 'Outfit-Medium' as const;

interface FontState {
  loaded: boolean;
  setLoaded: (loaded: boolean) => void;
}

/** Published so any text primitive can react when the vendored fonts finish loading. */
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

/** Latin text also uses Tajawal in Coral; 600 promotes to Bold. */
export function latinFontFamily(weight: TextStyleToken['fontWeight']): string {
  switch (weight) {
    case '700':
    case '600':
      return LATIN_FONTS.bold;
    case '500':
      return LATIN_FONTS.medium;
    default:
      return LATIN_FONTS.regular;
  }
}

/**
 * The font family to apply for a given locale/weight, or `undefined` to use the
 * system font until the vendored faces have loaded. Numeral tiers resolve to
 * Outfit Medium in both locales for tabular figures.
 */
export function resolveFontFamily(
  locale: Locale,
  fontsLoaded: boolean,
  weight: TextStyleToken['fontWeight'] = '400',
  variant?: TypographyVariant,
): string | undefined {
  if (!fontsLoaded) return undefined;
  if (variant === 'numeral' || variant === 'numeralSmall') return NUMERAL_FONT;
  return locale === 'ar' ? arabicFontFamily(weight) : latinFontFamily(weight);
}
