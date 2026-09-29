import { Animated, Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { stepperTone } from './control-tones';
import { usePressFeedback } from './press-feedback';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Replaces the bare number; keep this one line and render units outside the box. */
  label?: string;
  /** Kept in accessibilityValue while the visual box stays one line. */
  unit?: string;
  /** What is being adjusted, spoken before the value. */
  accessibilityLabel?: string;
  /** Parent tiles can expose the accessibility actions while keeping these controls visual. */
  accessible?: boolean;
  decrementLabel: string;
  incrementLabel: string;
}

export const STEPPER_VISUAL_WIDTH = 118;
export const STEPPER_VISUAL_HEIGHT = 36;
const STEPPER_TARGET_SIZE = 44;

interface StepperActionProps {
  action: 'decrement' | 'increment';
  disabled: boolean;
  onPress: () => void;
  fill: string;
  glyph: string;
}

function StepperAction({ action, disabled, onPress, fill, glyph }: StepperActionProps) {
  const pressFeedback = usePressFeedback();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessible={false}
      importantForAccessibility="no"
      {...pressFeedback.pressHandlers}
      style={{
        width: STEPPER_TARGET_SIZE,
        height: STEPPER_TARGET_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: -(STEPPER_TARGET_SIZE - STEPPER_VISUAL_HEIGHT) / 2,
      }}
    >
      <Animated.View
        style={[
          {
            width: STEPPER_VISUAL_HEIGHT,
            height: STEPPER_VISUAL_HEIGHT,
            borderRadius: radius.none,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: fill,
          },
          disabled ? { opacity: 0.4 } : pressFeedback.animatedStyle,
        ]}
      >
        <Icon name={action === 'increment' ? 'plus' : 'minus'} size={18} color={glyph} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * One adjustable element: swipe up or down to change it. Row direction mirrors
 * under RTL while each 36pt square action keeps a 44pt Pressable.
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
  accessible = true,
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
    const tone = stepperTone(colors, action, disabled);
    return (
      <StepperAction
        action={action}
        disabled={disabled}
        onPress={onPress}
        fill={tone.fill}
        glyph={tone.glyph}
      />
    );
  };

  return (
    <View
      accessible={accessible}
      accessibilityRole={accessible ? 'adjustable' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      accessibilityValue={accessible ? { text: unit ? `${display} ${unit}` : display } : undefined}
      accessibilityActions={
        accessible
          ? [
              { name: 'increment', label: incrementLabel },
              { name: 'decrement', label: decrementLabel },
            ]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && !atMax) increment();
        else if (event.nativeEvent.actionName === 'decrement' && !atMin) decrement();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
    >
      <View
        style={{
          width: STEPPER_VISUAL_WIDTH,
          height: STEPPER_TARGET_SIZE,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: STEPPER_VISUAL_WIDTH,
            height: STEPPER_VISUAL_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.none,
            backgroundColor: colors.bg,
          }}
        >
          {circle('decrement', decrement, atMin)}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <AppText
              variant="bodyStrong"
              center
              numberOfLines={1}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {display}
            </AppText>
          </View>
          {circle('increment', increment, atMax)}
        </View>
      </View>
    </View>
  );
}
