import type { ReactNode } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePressFeedback } from './press-feedback';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, accessibilityLabel, style }: CardProps) {
  const { colors, shadow } = useTheme();
  const pressFeedback = usePressFeedback();
  const base: ViewStyle = {
    borderWidth: 1,
    borderColor: colors.cardEdge,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    ...shadow.card,
  };

  if (!onPress) {
    return (
      <View
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        style={[base, style]}
      >
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View style={[base, pressFeedback.animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}
