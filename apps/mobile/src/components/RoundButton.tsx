import type { AccessibilityState, StyleProp, ViewStyle } from 'react-native';
import { IconButton } from './IconButton';
import { resolveRoundButtonTone, type RoundButtonTone } from './button-tones';
import type { IconName } from './Icon';

export type { RoundButtonTone } from './button-tones';

export const ROUND_BUTTON_TARGET_SIZE = 44;

export interface RoundButtonProps {
  accessibilityLabel: string;
  onPress?: () => void;
  icon?: IconName;
  /** Mirror the icon in RTL. Back and forward need it; close does not. */
  directional?: boolean;
  /** A short glyph drawn instead of an icon, such as the avatar's initial. */
  label?: string;
  tone?: RoundButtonTone;
  /** @deprecated J: removed in C16. Size 40 maps to the J 44 visual. */
  size?: 36 | 40 | 44 | 48;
  disabled?: boolean;
  accessibilityState?: AccessibilityState;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** @deprecated J: removed in C16. Use `IconButton` directly. */
export function RoundButton({
  accessibilityLabel,
  onPress,
  icon,
  directional = false,
  label,
  tone = 'surface',
  size = 44,
  disabled = false,
  accessibilityState,
  style,
  testID,
}: RoundButtonProps) {
  const mappedSize = size === 40 ? 44 : size;
  return (
    <IconButton
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      icon={icon}
      directional={directional}
      label={label}
      tone={resolveRoundButtonTone(tone)}
      size={mappedSize}
      disabled={disabled}
      accessibilityState={accessibilityState}
      style={style}
      testID={testID}
    />
  );
}
