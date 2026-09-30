import { View } from 'react-native';
import { AppText } from '../../components';
import { spacing } from '../../theme';
import { ShoppingCheckbox } from './ShoppingCheckbox';

interface ShoppingRowProps {
  name: string;
  measure: string;
  purchased: boolean;
  accessibilityLabel: string;
  onToggle: () => void;
}

export function ShoppingRow({
  name,
  measure,
  purchased,
  accessibilityLabel,
  onToggle,
}: ShoppingRowProps) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <ShoppingCheckbox checked={purchased} label={accessibilityLabel} onPress={onToggle} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText
          variant="bodyStrong"
          color={purchased ? 'textMuted' : undefined}
          style={purchased ? { textDecorationLine: 'line-through' } : undefined}
        >
          {name}
        </AppText>
        <AppText variant="caption" muted>
          {measure}
        </AppText>
      </View>
    </View>
  );
}
