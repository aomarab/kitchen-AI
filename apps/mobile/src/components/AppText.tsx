import { Text, type TextProps, type TextStyle } from 'react-native';
import { maxFontScaleFor, typography, type ColorToken, type TypographyVariant } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useLocale } from '../lib/locale';
import { resolveFontFamily, useFontStore } from '../lib/fonts';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
  center?: boolean;
  muted?: boolean;
}

/**
 * The only text primitive in the app. It applies the locale-aware typography
 * scale (Arabic gets a taller line-height per spec §7) and pulls colours from
 * the theme so no screen sets raw font sizes or hex values.
 */
export function AppText({ variant = 'body', color, center, muted, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const { locale, dir } = useLocale();
  const fontsLoaded = useFontStore((state) => state.loaded);
  const token = typography(locale)[variant]!;
  const resolvedColor = color ? colors[color] : muted ? colors.textMuted : colors.text;
  const fontFamily = resolveFontFamily(locale, fontsLoaded, token.fontWeight);
  const base: TextStyle = {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    color: resolvedColor,
    fontFamily,
    // Alignment has to come from the *app* locale, and it has to come from
    // `writingDirection` rather than `textAlign`. iOS resolves the default
    // `textAlign: 'auto'` to natural alignment for the *bundle's* language, not
    // for `I18nManager.isRTL`, so on an English device every full-width Arabic
    // block (screen titles, card copy) hugged the left edge while the rows and
    // icons around it mirrored correctly. Setting `textAlign: 'right'` does not
    // fix it either: `makeRTLFlipLeftAndRightStyles` swaps left/right back
    // under forced RTL. Setting the base writing direction makes `auto` resolve
    // the way we want and is not subject to that swap. Verified in the
    // simulator; `text-direction.spec.ts` guards it.
    writingDirection: dir,
    // The weight-specific Arabic family already encodes the weight; setting
    // fontWeight on top of it makes iOS synthesize a heavier face.
    ...(fontFamily ? null : { fontWeight: token.fontWeight }),
    ...(center ? { textAlign: 'center' } : null),
  };
  return <Text style={[base, style]} maxFontSizeMultiplier={maxFontScaleFor(variant)} {...rest} />;
}
