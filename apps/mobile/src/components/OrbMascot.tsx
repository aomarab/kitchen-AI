import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import orb from '../../assets/mama/orb.png';
import { useAppActive, useReduceMotion } from '../hooks/motion';
import { ORB_MOTION, nextBlinkDelay, orbGeometry, type OrbState } from '../lib/orb';
import { useTheme } from '../theme/useTheme';

export type { OrbState } from '../lib/orb';

export interface OrbMascotProps {
  /** The orb's diameter, 28 to 120. */
  size?: number;
  state?: OrbState;
  accessible?: ViewProps['accessible'];
  style?: StyleProp<ViewStyle>;
}

const ease = Easing.inOut(Easing.sin);

/**
 * Mama (spec §8.3): the orb artwork with two capsule eyes drawn over it. It is
 * decorative; a caller that makes it tappable wraps it in a labelled button.
 * It is the app's only looping animation, and it only loops while it can be
 * seen: never under Reduce Motion, off screen, or with the app in the
 * background.
 */
export function OrbMascot({ size = 38, state = 'idle', accessible, style }: OrbMascotProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const active = useAppActive();
  const animate = !reduceMotion && focused && active;
  const { image, eye, eyes } = orbGeometry(size, state);

  const body = useRef(new Animated.Value(1)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const glance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    body.setValue(1);
    blink.setValue(1);
    glance.setValue(0);
    if (!animate) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loop: Animated.CompositeAnimation | undefined;
    const timing = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: ease, useNativeDriver: true });

    if (state === 'idle') {
      const { close, open, squash } = ORB_MOTION.blink;
      const schedule = () => {
        timer = setTimeout(() => {
          Animated.sequence([timing(blink, squash, close), timing(blink, 1, open)]).start(() => {
            if (!cancelled) schedule();
          });
        }, nextBlinkDelay());
      };
      schedule();
    } else if (state === 'looking') {
      const { travel, move, hold } = ORB_MOTION.glance;
      const distance = size * travel;
      loop = Animated.loop(
        Animated.sequence([
          timing(glance, distance, move),
          Animated.delay(hold),
          timing(glance, -distance, move * 2),
          Animated.delay(hold),
          timing(glance, 0, move),
        ]),
      );
    } else {
      const { peak, period } = state === 'listening' ? ORB_MOTION.breathe : ORB_MOTION.pulse;
      loop = Animated.loop(
        Animated.sequence([timing(body, peak, period / 2), timing(body, 1, period / 2)]),
      );
    }
    loop?.start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      loop?.stop();
      body.stopAnimation();
      blink.stopAnimation();
      glance.stopAnimation();
    };
  }, [animate, state, size, body, blink, glance]);

  const eyeStyle: ViewStyle = {
    width: eye.width,
    height: eye.height,
    borderRadius: eye.width / 2,
    backgroundColor: colors.textInverse,
  };

  return (
    <View
      accessible={accessible}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: size, height: size }, style]}
    >
      <Animated.View style={{ width: size, height: size, transform: [{ scale: body }] }}>
        <Image
          source={orb}
          style={{
            position: 'absolute',
            top: image.offset,
            start: image.offset,
            width: image.size,
            height: image.size,
          }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            top: eyes.top,
            start: 0,
            width: size,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: eyes.gap,
            transform: [{ translateX: glance }, { scaleY: blink }],
          }}
        >
          <View style={eyeStyle} />
          <View style={eyeStyle} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
