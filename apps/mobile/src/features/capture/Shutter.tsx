import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { CountBadge } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { useReduceMotion } from '../../hooks/motion';

export const SHUTTER_BADGE_POP_SCALE = 1.15;
export const SHUTTER_BADGE_POP_STEP_MS = 90;
export const SHUTTER_BADGE_POP_MS = SHUTTER_BADGE_POP_STEP_MS * 2;

interface ShutterProps {
  count: number;
  accessibilityLabel: string;
  countAccessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  onOpenTray: () => void;
}

/** 76pt coral shutter in a 4pt inverse ring, with the animated photo-count badge. */
export function Shutter({
  count,
  accessibilityLabel,
  countAccessibilityLabel,
  disabled = false,
  onPress,
  onOpenTray,
}: ShutterProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const pressScale = useRef(new Animated.Value(1)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
  const previousCount = useRef(count);

  const animatePress = (toValue: number) => {
    Animated.timing(pressScale, {
      toValue,
      duration: 90,
      useNativeDriver: true,
    }).start();
  };

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
    <View style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animatePress(0.92)}
        onPressOut={() => animatePress(1)}
        style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            borderWidth: 4,
            borderColor: colors.textInverse,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.55 : 1,
            transform: [{ scale: pressScale }],
          }}
        >
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: colors.primary,
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
