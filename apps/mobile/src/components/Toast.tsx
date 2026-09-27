import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { useTabBarClearance } from './TabBar';
import { useReduceMotion } from '../hooks/motion';
import { useToastStore } from '../stores/toast';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export function Toast() {
  const toast = useToastStore((state) => state.toast);
  const dismiss = useToastStore((state) => state.dismiss);
  const clearance = useTabBarClearance();
  const reduceMotion = useReduceMotion();
  const { colors, shadow } = useTheme();
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!toast) return;
    progress.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, toast]);

  if (!toast) return null;

  const runAction = () => {
    toast.onAction?.();
    dismiss();
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        start: spacing.lg,
        end: spacing.lg,
        bottom: clearance + spacing.sm,
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={{
          maxWidth: 420,
          opacity: progress,
          transform: [
            {
              translateY: reduceMotion
                ? 0
                : progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceInverse,
            ...shadow.raised,
          }}
        >
          <AppText variant="bodyStrong" style={{ color: colors.textInverse, flexShrink: 1 }}>
            {toast.message}
          </AppText>
          {toast.actionLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={toast.actionLabel}
              onPress={runAction}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <AppText variant="bodyStrong" style={{ color: colors.primaryInverse }}>
                {toast.actionLabel}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}
