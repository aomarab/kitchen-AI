import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fontFamily, typography, type ColorToken, type TypographyVariant } from '../theme';
import { useLocale } from '../lib/locale';

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
  const token = typography(locale)[variant]!;
  const resolvedColor = color ? colors[color] : muted ? colors.textMuted : colors.text;
  const base: TextStyle = {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    fontWeight: token.fontWeight,
    color: resolvedColor,
    fontFamily,
    ...(center ? { textAlign: 'center' } : null),
  };
  return <Text style={[base, style]} {...rest} />;
}
