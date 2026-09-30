import { View } from 'react-native';
import { AppText } from '../../components';
import { useTheme } from '../../theme/useTheme';
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
  const { colors } = useTheme();

  return (
    <View
      style={{
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.rowline,
      }}
    >
      <ShoppingCheckbox checked={purchased} label={accessibilityLabel} onPress={onToggle} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" color={purchased ? 'textMuted' : undefined}>
          {name}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {measure}
        </AppText>
      </View>
    </View>
  );
}
