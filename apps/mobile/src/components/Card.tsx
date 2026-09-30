import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, spacing, type PaletteColors, type Tint } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'surface' | 'alt' | 'primary';
  /** Fills the card with one of the rotating pastel tints from the theme. Takes
   *  precedence over `tone`. */
  tint?: Tint;
  /** The hero treatment: the ember gradient carrying inverse text. */
  gradient?: boolean;
  style?: ViewStyle;
}

const fillFor = (colors: PaletteColors): Record<NonNullable<CardProps['tone']>, string> => ({
  surface: colors.surface,
  alt: colors.surfaceAlt,
  primary: colors.primarySoft,
});

export function Card({
  children,
  onPress,
  accessibilityLabel,
  tone = 'surface',
  tint,
  gradient,
  style,
}: CardProps) {
  const { colors, gradientHero, isDark, shadow } = useTheme();
  const fill = tint ? tint.bg : fillFor(colors)[tone];
  // Spec §6.7: a light card separates from the cream page by its fill and a
  // faint shadow, so its border matches the fill. A dark page hides any
  // shadow, so there the depth moves onto the edge.
  const base: ViewStyle = {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: fill,
    borderColor: isDark ? colors.border : fill,
    ...(isDark ? null : shadow.card),
  };

  /** Ember runs from roasted cocoa up to a burnt coral, so inverse text reads
   *  across the whole ramp (`palette.spec.ts`, "hero gradient"). */
  const body = gradient ? (
    <LinearGradient
      colors={gradientHero as unknown as readonly [string, string, ...string[]]}
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
      style={({ pressed }) => [
        wrapper,
        { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      {body}
    </Pressable>
  );
}
