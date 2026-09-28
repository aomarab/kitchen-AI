import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useAppActive, useReduceMotion } from '../../hooks/motion';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export const WAVEFORM_BAR_COUNT = 5;
export const WAVEFORM_DURATION_MS = 520;
export const WAVEFORM_STAGGER_MS = 80;
export const WAVEFORM_MIN_SCALE = 0.45;
export const WAVEFORM_MAX_SCALE = 1;

const STATIC_SCALES = [0.55, 0.82, 1, 0.72, 0.48] as const;

/** Five-bar speaking indicator (spec §8.7/§13), static under Reduce Motion. */
export function Waveform() {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const active = useAppActive();
  const values = useRef(
    Array.from(
      { length: WAVEFORM_BAR_COUNT },
      (_, index) => new Animated.Value(STATIC_SCALES[index]!),
    ),
  ).current;

  useEffect(() => {
    if (reduceMotion || !active) {
      values.forEach((value, index) => value.setValue(STATIC_SCALES[index]!));
      return;
    }

    const loops = values.map((value, index) => {
      value.setValue(STATIC_SCALES[index]!);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(index * WAVEFORM_STAGGER_MS),
          Animated.timing(value, {
            toValue: WAVEFORM_MAX_SCALE,
            duration: WAVEFORM_DURATION_MS / 2,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: WAVEFORM_MIN_SCALE,
            duration: WAVEFORM_DURATION_MS / 2,
            useNativeDriver: true,
          }),
          Animated.delay((WAVEFORM_BAR_COUNT - index) * WAVEFORM_STAGGER_MS),
        ]),
      );
      loop.start();
      return loop;
    });

    return () => {
      loops.forEach((loop) => loop.stop());
      values.forEach((value) => value.stopAnimation());
    };
  }, [active, reduceMotion, values]);

  return (
    <View
      style={{
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
      }}
    >
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: 4,
            height: 22,
            borderRadius: radius.pill,
            backgroundColor: colors.primaryText,
            transform: [{ scaleY: value }],
          }}
        />
      ))}
    </View>
  );
}
