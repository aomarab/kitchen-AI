import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import type { RecognizedItem } from '@kitchen/contracts';
import { AppText } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { buildArPinLabel } from '../../lib/ar-pin-labels';
import {
  boxRectForFrame,
  layoutPins,
  type PinBoxRect,
  type PinFrame,
  type PlacedPin,
} from '../../lib/ar-pins';
import { formatMeasure, localizedName } from '../../lib/format';
import { isLowConfidence } from '../../lib/capture';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { useReduceMotion } from '../../hooks/motion';

export const AR_PIN_STAGGER_MS = 40;
export const DETECTION_CORNER_LENGTH = 18;
export const DETECTION_CORNER_THICKNESS = 3;
export const DETECTION_TAG_HEIGHT = 22;

interface ArPinsProps {
  items: readonly RecognizedItem[];
  frame: PinFrame | null;
  onPress: (tempId: string) => void;
}

interface PinViewProps {
  pin: PlacedPin;
  index: number;
  label: ReturnType<typeof buildArPinLabel>;
  box: PinBoxRect;
  direction: 'ltr' | 'rtl';
  onPress: () => void;
}

function Corner({
  vertical,
  horizontal,
  color,
}: {
  vertical: 'top' | 'bottom';
  horizontal: 'start' | 'end';
  color: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        [vertical]: 0,
        [horizontal]: 0,
        width: DETECTION_CORNER_LENGTH,
        height: DETECTION_CORNER_LENGTH,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: vertical === 'top' ? 0 : undefined,
          bottom: vertical === 'bottom' ? 0 : undefined,
          start: 0,
          end: 0,
          height: DETECTION_CORNER_THICKNESS,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          start: horizontal === 'start' ? 0 : undefined,
          end: horizontal === 'end' ? 0 : undefined,
          width: DETECTION_CORNER_THICKNESS,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function DetectionCorners({ box, lowConfidence }: { box: PinBoxRect; lowConfidence: boolean }) {
  const { colors } = useTheme();
  const color = lowConfidence ? colors.textInverseMuted : colors.primary;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        start: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderStyle: lowConfidence ? 'dashed' : 'solid',
        borderWidth: lowConfidence ? 1 : 0,
        borderColor: lowConfidence ? colors.textInverseMuted : 'transparent',
      }}
    >
      <Corner vertical="top" horizontal="start" color={color} />
      <Corner vertical="top" horizontal="end" color={color} />
      <Corner vertical="bottom" horizontal="start" color={color} />
      <Corner vertical="bottom" horizontal="end" color={color} />
    </View>
  );
}

function PinView({ pin, index, label, box, direction, onPress }: PinViewProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const pressFeedback = usePressFeedback();

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const timer = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 1,
        duration: 120,
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
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        start: 0,
        top: 0,
        end: 0,
        bottom: 0,
        opacity: progress,
      }}
    >
      <DetectionCorners box={box} lowConfidence={pin.lowConfidence} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label.accessibilityLabel}
        onPress={onPress}
        {...pressFeedback.pressHandlers}
        style={{
          position: 'absolute',
          start: Math.max(0, Math.min(box.x, pin.chip.x)),
          top: Math.max(0, box.y - DETECTION_TAG_HEIGHT - spacing.xs),
          maxWidth: pin.chip.width,
          minHeight: 44,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            direction,
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: DETECTION_TAG_HEIGHT,
            paddingHorizontal: spacing.sm,
            backgroundColor: pin.lowConfidence ? colors.surfaceInverseAlt : colors.primary,
            ...pressFeedback.animatedStyle,
          }}
        >
          <AppText
            variant="eyebrow"
            numberOfLines={1}
            style={{
              color: pin.lowConfidence ? colors.textInverse : colors.onFill,
              flexShrink: 1,
            }}
          >
            {label.text}
          </AppText>
        </Animated.View>
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
          locale,
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
        const item = items.find((candidate) => candidate.tempId === pin.id);
        const box = boxRectForFrame(item?.box, frame);
        if (!label || !box) return null;
        return (
          <PinView
            key={pin.id}
            pin={pin}
            index={index}
            label={label}
            box={box}
            direction={dir}
            onPress={() => onPress(pin.id)}
          />
        );
      })}
    </View>
  );
}
