import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import {
  buttonTone,
  resolveButtonVariant,
  type ButtonToneName,
  type ButtonVariant,
} from './button-tones';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { ButtonVariant } from './button-tones';
export type ButtonSize = 'L' | 'S';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Danger text on a ghost button. */
  tone?: ButtonToneName;
  size?: ButtonSize;
  leadingIcon?: IconName;
  icon?: IconName;
  trailingIcon?: IconName;
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
  tone: toneName = 'default',
  size = 'L',
  leadingIcon,
  icon,
  trailingIcon,
  arrow,
  loading,
  disabled,
  fullWidth = true,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const tone = buttonTone(colors, variant, { tone: toneName, disabled: isDisabled });
  const resolvedVariant = resolveButtonVariant(variant);
  const compact = size === 'S';
  const height = compact ? 36 : 44;
  const labelVariant = compact ? 'buttonSmall' : 'button';
  const firstIcon = leadingIcon ?? icon;
  const lastIcon = trailingIcon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={hitSlop}
      style={[
        {
          minHeight: 44,
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexShrink: 0,
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: height,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            paddingHorizontal: resolvedVariant === 'ghost' ? 0 : compact ? 14 : 20,
            borderRadius: radius.none,
            backgroundColor: pressed ? tone.pressedFill : tone.fill,
            borderWidth: tone.borderWidth,
            borderColor: tone.border,
            opacity: !isDisabled && pressed && tone.pressedFill === tone.fill ? 0.85 : 1,
            alignSelf: fullWidth ? 'stretch' : 'flex-start',
            flexShrink: 0,
          }}
        >
          {loading ? (
            <ActivityIndicator color={tone.label} />
          ) : (
            <>
              {firstIcon ? <Icon name={firstIcon} size={18} color={tone.label} /> : null}
              <AppText variant={labelVariant} style={{ color: tone.label, flexShrink: 0 }}>
                {title}
              </AppText>
              {lastIcon ? <Icon name={lastIcon} size={18} color={tone.label} /> : null}
              {arrow ? <DirectionalIcon name="arrowForward" size={18} color={tone.label} /> : null}
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}
