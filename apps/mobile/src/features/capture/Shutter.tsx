import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { CountBadge } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { useReduceMotion } from '../../hooks/motion';

export const SHUTTER_BADGE_POP_SCALE = 1.15;
export const SHUTTER_BADGE_POP_STEP_MS = 90;
export const SHUTTER_BADGE_POP_MS = SHUTTER_BADGE_POP_STEP_MS * 2;
export const SHUTTER_TOUCH_TARGET_SIZE = 84;
export const SHUTTER_RING_SIZE = 76;
export const SHUTTER_CORE_SIZE = 60;
export const SHUTTER_RING_WIDTH = 3;
export const SHUTTER_BUSY_OPACITY = 0.4;

interface ShutterProps {
  count: number;
  accessibilityLabel: string;
  countAccessibilityLabel: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
  onOpenTray: () => void;
}

/** 76pt inverse shutter with the animated photo-count badge. */
export function Shutter({
  count,
  accessibilityLabel,
  countAccessibilityLabel,
  disabled = false,
  busy = false,
  onPress,
  onOpenTray,
}: ShutterProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const badgeScale = useRef(new Animated.Value(1)).current;
  const previousCount = useRef(count);
  const pressFeedback = usePressFeedback();

  useEffect(() => {
    if (count <= 0 || count === previousCount.current) {
      previousCount.current = count;
      return;
    }
    previousCount.current = count;
    if (reduceMotion) {
      badgeScale.setValue(1);
      return;
    }
    badgeScale.setValue(1);
    Animated.sequence([
      Animated.timing(badgeScale, {
        toValue: SHUTTER_BADGE_POP_SCALE,
        duration: SHUTTER_BADGE_POP_STEP_MS,
        useNativeDriver: true,
      }),
      Animated.timing(badgeScale, {
        toValue: 1,
        duration: SHUTTER_BADGE_POP_STEP_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [badgeScale, count, reduceMotion]);

  return (
    <View
      style={{
        width: SHUTTER_TOUCH_TARGET_SIZE,
        height: SHUTTER_TOUCH_TARGET_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onPress}
        {...pressFeedback.pressHandlers}
        style={{
          width: SHUTTER_TOUCH_TARGET_SIZE,
          height: SHUTTER_TOUCH_TARGET_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              width: SHUTTER_RING_SIZE,
              height: SHUTTER_RING_SIZE,
              borderRadius: radius.shutter,
              borderWidth: SHUTTER_RING_WIDTH,
              borderColor: colors.textInverse,
              alignItems: 'center',
              justifyContent: 'center',
            },
            disabled ? { opacity: 0.55 } : pressFeedback.animatedStyle,
          ]}
        >
          <View
            style={{
              width: SHUTTER_CORE_SIZE,
              height: SHUTTER_CORE_SIZE,
              borderRadius: radius.shutter,
              backgroundColor: colors.textInverse,
              opacity: busy ? SHUTTER_BUSY_OPACITY : 1,
            }}
          />
        </Animated.View>
      </Pressable>
      {count > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={countAccessibilityLabel}
          onPress={onOpenTray}
          style={{
            position: 'absolute',
            top: -spacing.xs,
            end: -spacing.xs,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View style={{ transform: [{ scale: badgeScale }] }}>
            <CountBadge count={count} accessibilityLabel={countAccessibilityLabel} />
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
}
