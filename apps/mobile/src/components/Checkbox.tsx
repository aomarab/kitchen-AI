import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { checkboxTone } from './control-tones';
import { Icon } from './Icon';
import { usePressFeedback } from './press-feedback';
import { radius } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface CheckboxProps {
  checked: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Checkbox({
  checked,
  accessibilityLabel,
  onPress,
  disabled = false,
  style,
  testID,
}: CheckboxProps) {
  const { colors } = useTheme();
  const tone = checkboxTone(colors, checked);
  const borderColor = checked ? tone.border : colors.control;
  const glyphColor = checked ? colors.onFill : tone.glyph;
  const pressFeedback = usePressFeedback();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      testID={testID}
      style={[
        {
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            width: 22,
            height: 22,
            borderRadius: radius.none,
            borderWidth: checked ? 0 : 1.5,
            borderColor,
            backgroundColor: tone.fill,
            alignItems: 'center',
            justifyContent: 'center',
          },
          disabled ? { opacity: 0.5 } : pressFeedback.animatedStyle,
        ]}
      >
        {checked ? <Icon name="check" size={16} color={glyphColor} /> : null}
      </Animated.View>
    </Pressable>
  );
}
