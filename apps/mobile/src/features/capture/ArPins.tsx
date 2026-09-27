import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import type { RecognizedItem } from '@kitchen/contracts';
import { AppText } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { buildArPinLabel } from '../../lib/ar-pin-labels';
import {
  layoutPins,
  PIN_ANCHOR,
  PIN_CHIP_HEIGHT,
  PIN_LEADER,
  type PinFrame,
  type PlacedPin,
} from '../../lib/ar-pins';
import { formatMeasure, localizedName } from '../../lib/format';
import { isLowConfidence } from '../../lib/capture';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { useReduceMotion } from '../../hooks/motion';

export const AR_PIN_INITIAL_SCALE = 0.6;
export const AR_PIN_STAGGER_MS = 40;
export const AR_PIN_SPRING_DAMPING = 18;
export const AR_PIN_SPRING_STIFFNESS = 220;

interface ArPinsProps {
  items: readonly RecognizedItem[];
  frame: PinFrame | null;
  onPress: (tempId: string) => void;
}

interface PinViewProps {
  pin: PlacedPin;
  index: number;
  label: ReturnType<typeof buildArPinLabel>;
  direction: 'ltr' | 'rtl';
  onPress: () => void;
}

function leaderTop(pin: PlacedPin): number {
  return pin.placement === 'above' ? pin.chip.y + PIN_CHIP_HEIGHT : pin.anchor.y + PIN_ANCHOR / 2;
}

function PinView({ pin, index, label, direction, onPress }: PinViewProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const timer = setTimeout(() => {
      Animated.spring(progress, {
        toValue: 1,
        damping: AR_PIN_SPRING_DAMPING,
        stiffness: AR_PIN_SPRING_STIFFNESS,
        useNativeDriver: true,
      }).start();
    }, index * AR_PIN_STAGGER_MS);
    return () => {
      clearTimeout(timer);
      progress.stopAnimation();
    };
  }, [index, progress, reduceMotion]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        start: pin.anchor.x,
        top: pin.anchor.y,
        opacity: progress,
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [AR_PIN_INITIAL_SCALE, 1],
            }),
          },
        ],
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          position: 'absolute',
          start: -PIN_ANCHOR / 2,
          top: -PIN_ANCHOR / 2,
          width: PIN_ANCHOR,
          height: PIN_ANCHOR,
          borderRadius: PIN_ANCHOR / 2,
          borderWidth: 3,
          borderColor: colors.textInverse,
          backgroundColor: colors.primary,
        }}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          position: 'absolute',
          start: -1,
          top: leaderTop(pin) - pin.anchor.y,
          width: 2,
          height: PIN_LEADER,
          borderRadius: 1,
          backgroundColor: colors.textInverse,
          opacity: 0.8,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label.accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => ({
          position: 'absolute',
          start: pin.chip.x - pin.anchor.x,
          top: pin.chip.y - pin.anchor.y,
          width: pin.chip.width,
          minHeight: 44,
          justifyContent: 'center',
          borderRadius: radius.pill,
          backgroundColor: colors.textInverse,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <View
          style={{
            direction,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: pin.lowConfidence ? colors.warnInverse : colors.primary,
            }}
          />
          <AppText
            variant="label"
            numberOfLines={1}
            style={{ color: colors.onPrimaryInverse, flexShrink: 1 }}
          >
            {label.text}
          </AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Pin overlay over a captured still. Positions stay in LTR image space in every locale. */
export function ArPins({ items, frame, onPress }: ArPinsProps) {
  const { t, locale, dir, prefs } = useFormat();

  const labels = useMemo(() => {
    const out = new Map<string, ReturnType<typeof buildArPinLabel>>();
    for (const item of items) {
      const name = localizedName(locale, item.nameEn, item.nameAr);
      const quantity = formatMeasure(t, locale, item.quantity, item.unit, prefs);
      out.set(
        item.tempId,
        buildArPinLabel({
          name,
          quantity,
          lowConfidence: isLowConfidence(item.confidence),
          t,
        }),
      );
    }
    return out;
  }, [items, locale, prefs, t]);

  const layout = useMemo(() => {
    if (!frame) return { pins: [], tray: [] };
    return layoutPins(
      items.map((item) => ({
        id: item.tempId,
        box: item.box,
        confidence: item.confidence,
        chipWidth: labels.get(item.tempId)?.width ?? 44,
      })),
      frame,
      dir,
    );
  }, [dir, frame, items, labels]);

  if (!frame) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        direction: 'ltr',
      }}
    >
      {layout.pins.map((pin, index) => {
        const label = labels.get(pin.id);
        if (!label) return null;
        return (
          <PinView
            key={pin.id}
            pin={pin}
            index={index}
            label={label}
            direction={dir}
            onPress={() => onPress(pin.id)}
          />
        );
      })}
    </View>
  );
}
