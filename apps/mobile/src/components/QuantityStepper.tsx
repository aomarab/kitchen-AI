import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { stepperTone } from './control-tones';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Replaces the bare number, e.g. "8 cups". */
  label?: string;
  /** Shown as a caption under the value, e.g. "kg". */
  unit?: string;
  /** What is being adjusted, spoken before the value. */
  accessibilityLabel?: string;
  decrementLabel: string;
  incrementLabel: string;
}

/**
 * `−` and `+` circles of 32pt, each centred in a 44pt Pressable, around a
 * `bodyStrong` value (spec §8.4). To a screen reader it is one adjustable
 * element: swipe up or down to change it. Row direction mirrors under RTL.
 */
export function QuantityStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  label,
  unit,
  accessibilityLabel,
  decrementLabel,
  incrementLabel,
}: QuantityStepperProps) {
  const { colors } = useTheme();
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(max === undefined ? value + step : Math.min(max, value + step));
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const display = label ?? String(value);

  const circle = (action: 'decrement' | 'increment', onPress: () => void, disabled: boolean) => {
    const tone = stepperTone(colors, action);
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {({ pressed }) => (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tone.fill,
              opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            }}
          >
            <Icon name={action === 'increment' ? 'plus' : 'minus'} size={18} color={tone.glyph} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: unit ? `${display} ${unit}` : display }}
      accessibilityActions={[
        { name: 'increment', label: incrementLabel },
        { name: 'decrement', label: decrementLabel },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && !atMax) increment();
        else if (event.nativeEvent.actionName === 'decrement' && !atMin) decrement();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
    >
      {circle('decrement', decrement, atMin)}
      <View style={{ minWidth: 40, alignItems: 'center' }}>
        <AppText variant="bodyStrong" center style={{ fontVariant: ['tabular-nums'] }}>
          {display}
        </AppText>
        {unit ? (
          <AppText variant="caption" muted center>
            {unit}
          </AppText>
        ) : null}
      </View>
      {circle('increment', increment, atMax)}
    </View>
  );
}
