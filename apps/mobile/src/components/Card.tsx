import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'surface' | 'alt' | 'primary';
  style?: ViewStyle;
}

const TONE: Record<NonNullable<CardProps['tone']>, ViewStyle> = {
  surface: { backgroundColor: colors.surface, borderColor: colors.border },
  alt: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  primary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
};

export function Card({ children, onPress, accessibilityLabel, tone = 'surface', style }: CardProps) {
  const base: ViewStyle = {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...TONE[tone],
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}
