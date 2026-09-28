import { View } from 'react-native';
import { AppText } from './AppText';
import { Toggle } from './Toggle';
import { spacing } from '../theme';

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
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: hint ? 'flex-start' : 'center', gap: spacing.md },
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
      <Toggle value={value} onValueChange={onValueChange} accessibilityLabel={label} />
    </View>
  );
}
