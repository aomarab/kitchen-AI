import { Switch, View } from 'react-native';
import { AppText } from './AppText';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Row sizing and padding for use inside `ListGroup`, matching `ListRow grouped`. */
  grouped?: boolean;
}

/** Labelled switch row used across Settings. */
export function ToggleRow({ label, hint, value, onValueChange, grouped }: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        grouped
          ? { minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }
          : null,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{label}</AppText>
        {hint ? (
          <AppText variant="caption" muted>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={colors.surface}
      />
    </View>
  );
}
