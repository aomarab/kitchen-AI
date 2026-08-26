import { Pressable } from 'react-native';
import { AppText } from './AppText';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Selectable pill used for filters, plan slots and preference toggles. */
export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={hitSlop}
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
      }}
    >
      <AppText variant="label" style={{ color: selected ? colors.primaryText : colors.textMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
}
