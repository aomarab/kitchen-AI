import type { ReactNode } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePressFeedback } from './press-feedback';
import { spacing, type PaletteColors, type Tint } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** @deprecated J: removed in C16. `surface` keeps the J card; `alt`/`primary` map to `surfaceAlt`. */
  tone?: 'surface' | 'alt' | 'primary';
  /** @deprecated J: removed in C16. Tints map to the closest flat J surface. */
  tint?: Tint;
  /** @deprecated J: removed in C16. Kept for legacy hero cards until their screen group migrates. */
  gradient?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Optional inner style for gradient cards whose wrapper must carry layout flex. */
  contentStyle?: StyleProp<ViewStyle>;
}

const fillFor = (colors: PaletteColors): Record<NonNullable<CardProps['tone']>, string> => ({
  surface: colors.surface,
  alt: colors.surfaceAlt,
  primary: colors.surfaceAlt,
});

export function Card({
  children,
  onPress,
  accessibilityLabel,
  tone = 'surface',
  tint,
  gradient,
  style,
  contentStyle,
}: CardProps) {
  const { colors, gradientHero, shadow } = useTheme();
  const pressFeedback = usePressFeedback();
  const fill = tint ? colors.surfaceAlt : fillFor(colors)[tone];
  const base: ViewStyle = {
    borderWidth: 1,
    borderColor: colors.cardEdge,
    padding: gradient ? 0 : spacing.lg,
    gap: spacing.sm,
    backgroundColor: fill,
    ...shadow.card,
  };

  const body = gradient ? (
    <LinearGradient
      colors={gradientHero as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ padding: spacing.lg, gap: spacing.sm }, contentStyle]}
    >
      {children}
    </LinearGradient>
  ) : (
    children
  );

  if (!onPress) return <View style={[base, style]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View style={[base, pressFeedback.animatedStyle, style]}>{body}</Animated.View>
    </Pressable>
  );
}
