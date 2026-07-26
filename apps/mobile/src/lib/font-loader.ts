import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { ARABIC_FONTS, useFontStore } from './fonts';
import RegularArabic from '../../assets/fonts/IBMPlexSansArabic-Regular.ttf';
import MediumArabic from '../../assets/fonts/IBMPlexSansArabic-Medium.ttf';
import SemiBoldArabic from '../../assets/fonts/IBMPlexSansArabic-SemiBold.ttf';
import BoldArabic from '../../assets/fonts/IBMPlexSansArabic-Bold.ttf';

/**
 * The vendored IBM Plex Sans Arabic faces, bundled as Metro assets so they ship
 * inside the JS bundle (offline, no CDN) and appear in `expo export` output. The
 * same files are ALSO embedded natively via the `expo-font` config plugin in
 * app.json (its `fonts` array), which pre-registers them for standalone builds
 * so there is no first-paint flash of the fallback font. This runtime loader
 * covers Expo Go / the dev-client, where config plugins are not applied.
 *
 * expo-font registers each face under the exact key string, identically on iOS
 * and Android, so the family the text primitives reference can never silently
 * fall back to the system font.
 */
const FONT_SOURCES = {
  [ARABIC_FONTS.regular]: RegularArabic,
  [ARABIC_FONTS.medium]: MediumArabic,
  [ARABIC_FONTS.semibold]: SemiBoldArabic,
  [ARABIC_FONTS.bold]: BoldArabic,
};

/**
 * Registers the Arabic font faces. Call once, high in the tree. The app never
 * blocks on it: standalone builds already have the faces from the config plugin,
 * and in Expo Go the screens render with the system Arabic font for a frame and
 * re-render once loading resolves.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts(FONT_SOURCES);
  const setLoaded = useFontStore((state) => state.setLoaded);
  useEffect(() => {
    if (loaded) setLoaded(true);
  }, [loaded, setLoaded]);
  return loaded;
}
