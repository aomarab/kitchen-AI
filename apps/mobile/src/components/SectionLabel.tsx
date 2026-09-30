import type { ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { usePressFeedback } from './press-feedback';
import { spacing } from '../theme';

export interface SectionLabelProps {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  small?: boolean;
}

export function SectionLabel({
  children,
  actionLabel,
  onAction,
  small = false,
}: SectionLabelProps) {
  const pressFeedback = usePressFeedback();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <AppText variant={small ? 'label' : 'heading'} style={{ flex: 1 }}>
        {children}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          {...pressFeedback.pressHandlers}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Animated.View style={pressFeedback.animatedStyle}>
            <AppText variant="label" color="primaryText">
              {actionLabel}
            </AppText>
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
}
