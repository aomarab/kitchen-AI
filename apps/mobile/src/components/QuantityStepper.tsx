import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { colors, hitSlop, radius, spacing } from '../theme';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  label?: string;
  decrementLabel: string;
  incrementLabel: string;
}

/** Accessible +/- stepper. Row direction mirrors automatically under RTL. */
export function QuantityStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
  decrementLabel,
  incrementLabel,
}: QuantityStepperProps) {
  const button = (icon: 'plus' | 'minus', onPress: () => void, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={hitSlop}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
      }}
    >
      <Icon name={icon} size={18} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      {button('minus', () => onChange(Math.max(min, value - step)), decrementLabel)}
      <AppText variant="bodyStrong" style={{ minWidth: 40, textAlign: 'center' }}>
        {label ?? String(value)}
      </AppText>
      {button('plus', () => onChange(value + step), incrementLabel)}
    </View>
  );
}
