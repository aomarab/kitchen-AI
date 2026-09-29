import { ActivityIndicator, Animated, Pressable, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { buttonTone, type ButtonToneName, type ButtonVariant } from './button-tones';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { usePressFeedback } from './press-feedback';
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
  const compact = size === 'S';
  const height = compact ? 36 : 44;
  const labelVariant = compact ? 'buttonSmall' : 'button';
  const firstIcon = leadingIcon;
  const lastIcon = trailingIcon;
  const pressFeedback = usePressFeedback();
  const animatedFill =
    tone.pressedFill === tone.fill
      ? tone.fill
      : pressFeedback.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [tone.fill, tone.pressedFill],
        });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={hitSlop}
      {...pressFeedback.pressHandlers}
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
      <Animated.View
        style={[
          {
            minHeight: height,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            paddingHorizontal: variant === 'ghost' ? 0 : compact ? 14 : 20,
            borderRadius: radius.none,
            backgroundColor: animatedFill,
            borderWidth: tone.borderWidth,
            borderColor: tone.border,
            alignSelf: fullWidth ? 'stretch' : 'flex-start',
            flexShrink: 0,
          },
          !isDisabled && tone.pressedFill === tone.fill ? pressFeedback.animatedStyle : null,
        ]}
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
      </Animated.View>
    </Pressable>
  );
}
