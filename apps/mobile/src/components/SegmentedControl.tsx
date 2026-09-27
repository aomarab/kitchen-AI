import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { segmentTone, segmentTrack, type SegmentTone } from './control-tones';
import { radius, spacing } from '../theme';
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

/**
 * Equal segments on a sunk track, with the choice on a raised white thumb
 * (spec §6.7: track `surfaceAlt`, thumb radius `sm`). Labels wrap rather than
 * truncate, so a long Arabic label grows the track instead of losing words.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tone = 'default',
}: SegmentedControlProps<T>) {
  const { colors, isDark, shadow } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        minHeight: 44,
        padding: spacing.xs,
        borderRadius: radius.sm + spacing.xs,
        backgroundColor: segmentTrack(colors, tone),
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const segment = segmentTone(colors, selected, isDark, tone);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={spacing.xs}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              {
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: segment.border,
                backgroundColor: segment.fill,
                opacity: pressed && !selected ? 0.85 : 1,
              },
              selected && tone === 'default' && !isDark ? shadow.card : null,
            ]}
          >
            <AppText variant="label" center numberOfLines={2} style={{ color: segment.label }}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
