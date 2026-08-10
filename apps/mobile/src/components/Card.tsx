import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradientHero, radius, spacing, type Tint } from '../theme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'surface' | 'alt' | 'primary';
  /** Fills the card with one of the rotating pastel tints from the theme. Takes
   *  precedence over `tone`, and drops the border so the fill reads as the edge. */
  tint?: Tint;
  /** The hero treatment: an indigo gradient carrying inverse text. */
  gradient?: boolean;
  style?: ViewStyle;
}

const TONE: Record<NonNullable<CardProps['tone']>, ViewStyle> = {
  surface: { backgroundColor: colors.surface, borderColor: colors.border },
  alt: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  primary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
};

/** The reference's feature card runs indigo into a desaturated teal. */
const GRADIENT = gradientHero;

export function Card({
  children,
  onPress,
  accessibilityLabel,
  tone = 'surface',
  tint,
  gradient,
  style,
}: CardProps) {
  const base: ViewStyle = {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...TONE[tone],
    ...(tint ? { backgroundColor: tint.bg, borderColor: tint.bg } : null),
    ...(gradient ? { backgroundColor: 'transparent', borderColor: 'transparent' } : null),
  };

  const body = gradient ? (
    <LinearGradient
      colors={GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}
    >
      {children}
    </LinearGradient>
  ) : (
    children
  );

  const wrapper: ViewStyle = gradient
    ? { borderRadius: radius.lg, overflow: 'hidden', ...(style ?? {}) }
    : { ...base, ...(style ?? {}) };

  if (!onPress) return <View style={wrapper}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [wrapper, { opacity: pressed ? 0.9 : 1 }]}
    >
      {body}
    </Pressable>
  );
}
