import { Text, type TextProps, type TextStyle } from 'react-native';
import {
  colors,
  maxFontScaleFor,
  typography,
  type ColorToken,
  type TypographyVariant,
} from '../theme';
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
export function AppText({
  variant = 'body',
  color,
  center,
  muted,
  style,
  ...rest
}: AppTextProps) {
  const { locale } = useLocale();
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
    // The weight-specific Arabic family already encodes the weight; setting
    // fontWeight on top of it makes iOS synthesize a heavier face.
    ...(fontFamily ? null : { fontWeight: token.fontWeight }),
    ...(center ? { textAlign: 'center' } : null),
  };
  return <Text style={[base, style]} maxFontSizeMultiplier={maxFontScaleFor(variant)} {...rest} />;
}
