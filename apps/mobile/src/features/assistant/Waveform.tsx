import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useAppActive, useReduceMotion } from '../../hooks/motion';
import { useTheme } from '../../theme/useTheme';

export const WAVEFORM_BAR_COUNT = 24;
export const WAVEFORM_BAR_WIDTH = 3;
export const WAVEFORM_BAR_GAP = 3;
export const WAVEFORM_WIDTH = 141;
export const WAVEFORM_HEIGHT = 40;
export const WAVEFORM_DURATION_MS = 520;
export const WAVEFORM_STAGGER_MS = 26;
export const WAVEFORM_MIN_SCALE = 0.45;
export const WAVEFORM_MAX_SCALE = 1;

const STATIC_SCALES = [
  0.38, 0.58, 0.78, 0.92, 0.66, 0.82, 1, 0.72, 0.5, 0.86, 0.96, 0.62, 0.74, 0.9, 0.52, 0.68, 0.86,
  0.44, 0.72, 0.54, 0.36, 0.64, 0.84, 0.46,
] as const;

/** Coral waveform (spec §8/§13), static under Reduce Motion. */
export function Waveform({
  media = false,
  highlightTail = false,
}: {
  media?: boolean;
  highlightTail?: boolean;
}) {
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
        width: WAVEFORM_WIDTH,
        height: WAVEFORM_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: WAVEFORM_BAR_GAP,
      }}
    >
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: WAVEFORM_BAR_WIDTH,
            height: WAVEFORM_HEIGHT,
            backgroundColor:
              highlightTail && index >= WAVEFORM_BAR_COUNT - 4
                ? colors.primary
                : media
                  ? colors.textInverse
                  : colors.text,
            transform: [{ scaleY: value }],
          }}
        />
      ))}
    </View>
  );
}
