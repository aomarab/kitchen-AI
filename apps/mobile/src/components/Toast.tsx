import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { usePressFeedback } from './press-feedback';
import { useTabBarClearance } from './TabBar';
import { useReduceMotion } from '../hooks/motion';
import { useToastStore } from '../stores/toast';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export function Toast() {
  const toast = useToastStore((state) => state.toast);
  const footerOffset = useToastStore((state) => state.footerOffset);
  const dismiss = useToastStore((state) => state.dismiss);
  const clearance = useTabBarClearance();
  const reduceMotion = useReduceMotion();
  const { colors, shadow } = useTheme();
  const progress = useRef(new Animated.Value(1)).current;
  const actionFeedback = usePressFeedback();

  useEffect(() => {
    if (!toast) return;
    progress.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    Animated.timing(progress, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [progress, reduceMotion, toast]);

  if (!toast) return null;

  const runAction = () => {
    toast.onAction?.();
    dismiss();
  };
  const bottomOffset = (footerOffset > 0 ? footerOffset : clearance) + spacing.sm;
  const error = toast.tone === 'error';

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        start: spacing.lg,
        end: spacing.lg,
        bottom: bottomOffset,
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
          accessibilityRole="alert"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: colors.inverse,
            ...shadow.raised,
          }}
        >
          <Icon name={error ? 'alert' : 'checkCircle'} size={20} color={colors.onInverse} />
          <AppText variant="body" style={{ color: colors.onInverse, flexShrink: 1 }}>
            {toast.message}
          </AppText>
          {toast.actionLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={toast.actionLabel}
              onPress={runAction}
              {...actionFeedback.pressHandlers}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Animated.View style={actionFeedback.animatedStyle}>
                <AppText variant="buttonSmall" style={{ color: colors.primaryOnInverse }}>
                  {toast.actionLabel}
                </AppText>
              </Animated.View>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}
