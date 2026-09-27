import { Pressable } from 'react-native';
import { AppText } from './AppText';
import { chipTone, type ChipVariant } from './control-tones';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { ChipVariant } from './control-tones';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** `tag` is the small location label inside a tile (spec §8.4). */
  variant?: ChipVariant;
}

/** A 32pt pill for filters, plan slots and preferences, 56pt to the touch. */
export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityLabel,
  variant = 'pill',
}: ChipProps) {
  const { colors } = useTheme();
  const tone = chipTone(colors, variant, selected);
  const tag = variant === 'tag';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={!onPress}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 32,
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: tone.border,
          backgroundColor: tone.fill,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        tag ? { minHeight: 24, paddingHorizontal: spacing.sm, borderRadius: radius.xs } : null,
      ]}
    >
      <AppText variant={tag ? 'caption' : 'label'} style={{ color: tone.label }}>
        {label}
      </AppText>
    </Pressable>
  );
}
