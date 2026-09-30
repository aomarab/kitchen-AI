import { Pressable, View } from 'react-native';
import { Icon } from '../../components';
import { radius } from '../../theme';
import { useTheme } from '../../theme/useTheme';

interface ShoppingCheckboxProps {
  checked: boolean;
  label: string;
  onPress: () => void;
}

export function ShoppingCheckbox({ checked, label, onPress }: ShoppingCheckboxProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          borderWidth: checked ? 1 : 1.5,
          borderColor: checked ? colors.success : colors.textMuted,
          backgroundColor: checked ? colors.success : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Icon name="check" size={16} color={colors.onSuccess} /> : null}
      </View>
    </Pressable>
  );
}
