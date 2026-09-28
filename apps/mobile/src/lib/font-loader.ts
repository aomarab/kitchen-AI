import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { ARABIC_FONTS, NUMERAL_FONT, useFontStore } from './fonts';
import MediumLatin from '../../assets/fonts/Outfit-Medium.ttf';
import RegularArabic from '../../assets/fonts/Tajawal-Regular.ttf';
import MediumArabic from '../../assets/fonts/Tajawal-Medium.ttf';
import BoldArabic from '../../assets/fonts/Tajawal-Bold.ttf';

/**
 * The vendored Tajawal text faces and Outfit numeral face, bundled as Metro
 * assets so they ship inside the JS bundle (offline, no CDN) and appear in
 * `expo export` output. The same files are ALSO embedded natively via the
 * `expo-font` config plugin in app.json (its `fonts` array), which pre-registers
 * them for standalone builds so there is no first-paint flash of the fallback
 * font. This runtime loader covers Expo Go / the dev-client, where config
 * plugins are not applied.
 */
const FONT_SOURCES = {
  [NUMERAL_FONT]: MediumLatin,
  [ARABIC_FONTS.regular]: RegularArabic,
  [ARABIC_FONTS.medium]: MediumArabic,
  [ARABIC_FONTS.bold]: BoldArabic,
};

/**
 * Registers the text and numeral font faces. Call once, high in the tree. The
 * app never blocks on it: standalone builds already have the faces from the
 * config plugin, and in Expo Go the screens render with the system font for a
 * frame and re-render once loading resolves.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts(FONT_SOURCES);
  const setLoaded = useFontStore((state) => state.setLoaded);
  useEffect(() => {
    if (loaded) setLoaded(true);
  }, [loaded, setLoaded]);
  return loaded;
}
