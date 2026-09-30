import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { PRESS_FEEDBACK_DIM_OPACITY, pressFeedbackDuration } from './press-feedback-tokens';
import { useReduceMotion } from '../hooks/motion';

export function usePressFeedback() {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  const animate = useCallback(
    (pressed: boolean) => {
      Animated.timing(progress, {
        toValue: pressed ? 1 : 0,
        duration: pressFeedbackDuration(reduceMotion),
        useNativeDriver: false,
      }).start();
    },
    [progress, reduceMotion],
  );

  return {
    progress,
    animatedStyle: {
      opacity: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, PRESS_FEEDBACK_DIM_OPACITY],
      }),
    },
    pressHandlers: {
      onPressIn: () => animate(true),
      onPressOut: () => animate(false),
    },
  };
}
