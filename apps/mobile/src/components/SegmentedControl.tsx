import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { segmentTone, segmentTrack, type SegmentTone } from './control-tones';
import { useReduceMotion } from '../hooks/motion';
import { radius, spacing, type PaletteColors } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  tone?: SegmentTone;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tone = 'default',
}: SegmentedControlProps<T>) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        minHeight: 44,
        borderWidth: 1,
        borderColor: tone === 'media' ? colors.borderInverse : colors.control,
        borderRadius: radius.none,
        backgroundColor: segmentTrack(colors, tone),
        overflow: 'hidden',
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <SegmentedOptionButton
            key={option.value}
            label={option.label}
            selected={selected}
            colors={colors}
            isDark={isDark}
            tone={tone}
            onPress={() => onChange(option.value)}
          />
        );
      })}
    </View>
  );
}

interface SegmentedOptionButtonProps {
  label: string;
  selected: boolean;
  colors: PaletteColors;
  isDark: boolean;
  tone: SegmentTone;
  onPress: () => void;
}

function SegmentedOptionButton({
  label,
  selected,
  colors,
  isDark,
  tone,
  onPress,
}: SegmentedOptionButtonProps) {
  const reduceMotion = useReduceMotion();
  const selectedOpacity = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const selectedTone = segmentTone(colors, true, isDark, tone);
  const labelTone = segmentTone(colors, selected, isDark, tone);

  useEffect(() => {
    Animated.timing(selectedOpacity, {
      toValue: selected ? 1 : 0,
      duration: reduceMotion ? 0 : 120,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, selected, selectedOpacity]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        opacity: pressed && !selected ? 0.85 : 1,
      })}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          start: 0,
          end: 0,
          backgroundColor: selectedTone.fill,
          opacity: selectedOpacity,
        }}
      />
      <AppText variant="buttonSmall" center numberOfLines={2} style={{ color: labelTone.label }}>
        {label}
      </AppText>
    </Pressable>
  );
}
