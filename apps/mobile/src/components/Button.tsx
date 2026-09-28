import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { buttonTone, type ButtonVariant } from './button-tones';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { ButtonVariant } from './button-tones';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  /** A trailing arrow ("Get started →"). Mirrors in RTL. */
  arrow?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  arrow,
  loading,
  disabled,
  fullWidth = true,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const tone = buttonTone(colors, variant);
  const isDisabled = disabled || loading;
  // Only the coral has a pressed colour; every other fill dims instead.
  const hasPressedFill = tone.pressedFill !== tone.fill;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          minHeight: 48,
          // Ghost has no fill and no border, so horizontal padding is
          // invisible weight that pushes the label off the content margin: the
          // home "See all" link sat 16pt inside the right edge every card below
          // it was flush with. Borderless buttons align to the margin (as iOS's
          // own section headers do); `hitSlop` and the 48pt height keep the
          // touch target legal without the padding.
          paddingHorizontal: variant === 'ghost' ? 0 : spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: pressed ? tone.pressedFill : tone.fill,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor:
            variant === 'secondary' ? tone.border : pressed ? tone.pressedFill : tone.fill,
          opacity: isDisabled ? 0.5 : pressed && !hasPressedFill ? 0.85 : 1,
          // Filled pills also give a little under the finger; a bare link only dims.
          transform: [{ scale: pressed && variant !== 'ghost' ? 0.98 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexShrink: 0,
        },
        // The one action a screen asks for is the tallest thing on it (spec §8.5).
        variant === 'primary' ? { minHeight: 56 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.label} />
      ) : (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 }}
        >
          {icon ? <Icon name={icon} size={18} color={tone.label} /> : null}
          <AppText variant="button" style={{ color: tone.label, flexShrink: 0 }}>
            {title}
          </AppText>
          {arrow ? <DirectionalIcon name="arrowForward" size={18} color={tone.label} /> : null}
        </View>
      )}
    </Pressable>
  );
}
