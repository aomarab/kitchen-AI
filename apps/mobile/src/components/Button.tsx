import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { hitSlop, radius, spacing, type PaletteColors } from '../theme';
import { useTheme } from '../theme/useTheme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'primaryInverse'
  | 'ghostInverse'
  | 'secondaryInverse';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

const bgFor = (colors: PaletteColors): Record<ButtonVariant, string> => ({
  primary: colors.primary,
  secondary: colors.surfaceAlt,
  ghost: 'transparent',
  danger: colors.danger,
  primaryInverse: colors.primaryInverse,
  ghostInverse: 'transparent',
  // The cook surface is dark in every mode, so this variant cannot reuse
  // `surfaceAlt`, which follows the mode and vanishes into the ground in dark.
  secondaryInverse: colors.surfaceInverseAlt,
});

const fgFor = (colors: PaletteColors): Record<ButtonVariant, string> => ({
  // `onFill` and not `textInverse`: in dark mode the fill is light and takes a
  // dark label, while `textInverse` still belongs to the always-dark cook
  // surface. The two are the same colour in light mode and opposites in dark.
  primary: colors.onFill,
  secondary: colors.text,
  ghost: colors.primaryText,
  danger: colors.onFill,
  // The lifted brand tone is light in both modes, so its label is always dark.
  primaryInverse: colors.onPrimaryInverse,
  ghostInverse: colors.primaryInverse,
  secondaryInverse: colors.textInverse,
});

/** Only `primary` gets a pressed colour, matching web's hover:bg-primary-press. */
const pressedBgFor = (colors: PaletteColors): Partial<Record<ButtonVariant, string>> => ({
  primary: colors.primaryPressed,
});

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  fullWidth = true,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const BG = bgFor(colors);
  const FG = fgFor(colors);
  const PRESSED_BG = pressedBgFor(colors);
  const isDisabled = disabled || loading;
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
          // Ghost variants have no fill and no border, so horizontal padding is
          // invisible weight that pushes the label off the content margin: the
          // home "See all" link sat 16pt inside the right edge every card below
          // it was flush with. Borderless buttons align to the margin (as iOS's
          // own section headers do); `hitSlop` and the 48pt height keep the
          // touch target legal without the padding.
          paddingHorizontal: variant === 'ghost' || variant === 'ghostInverse' ? 0 : spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: (pressed && PRESSED_BG[variant]) || BG[variant],
          borderWidth: variant === 'ghost' || variant === 'ghostInverse' ? 0 : 1,
          borderColor:
            variant === 'secondary'
              ? colors.border
              : variant === 'secondaryInverse'
                ? colors.borderInverse
                : (pressed && PRESSED_BG[variant]) || BG[variant],
          opacity: isDisabled ? 0.5 : pressed && !PRESSED_BG[variant] ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={FG[variant]} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {icon ? <Icon name={icon} size={18} color={FG[variant]} /> : null}
          <AppText variant="button" style={{ color: FG[variant] }}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}
