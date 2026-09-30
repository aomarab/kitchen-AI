import { useEffect, useRef } from 'react';
import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { toggleTone } from './control-tones';
import { usePressFeedback } from './press-feedback';
import { radius } from '../theme';
import { useReduceMotion } from '../hooks/motion';
import { useLocale } from '../lib/locale';
import { useTheme } from '../theme/useTheme';

export const TRACK_WIDTH = 44;
export const TRACK_HEIGHT = 26;
export const TOGGLE_TARGET_SIZE = 44;
const KNOB_SIZE = 20;
const TRACK_INSET = 3;
const TOGGLE_TRAVEL = TRACK_WIDTH - KNOB_SIZE - TRACK_INSET * 2;

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  style,
  testID,
}: ToggleProps) {
  const { colors } = useTheme();
  const { dir } = useLocale();
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  const tone = toggleTone(colors, value);
  const pressFeedback = usePressFeedback();

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: reduceMotion ? 0 : 160,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, value]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, dir === 'rtl' ? -TOGGLE_TRAVEL : TOGGLE_TRAVEL],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      {...pressFeedback.pressHandlers}
      testID={testID}
      style={[
        {
          height: TOGGLE_TARGET_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: radius.none,
            backgroundColor: tone.track,
          },
          disabled ? { opacity: 0.5 } : pressFeedback.animatedStyle,
        ]}
      >
        <Animated.View
          style={{
            position: 'absolute',
            start: TRACK_INSET,
            top: TRACK_INSET,
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: radius.none,
            backgroundColor: tone.knob,
            transform: [{ translateX }],
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
