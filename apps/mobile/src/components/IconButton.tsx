import {
  Pressable,
  View,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { iconButtonTone, type IconButtonTone } from './button-tones';
import { CHROME_MAX_FONT_SCALE, radius } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { IconButtonTone } from './button-tones';

export const ICON_BUTTON_TARGET_SIZE = 44;

export interface IconButtonProps {
  accessibilityLabel: string;
  onPress?: () => void;
  icon?: IconName;
  /** Mirror the icon in RTL. Back and forward need it; close does not. */
  directional?: boolean;
  /** A short glyph drawn instead of an icon, such as the avatar's initial. */
  label?: string;
  tone?: IconButtonTone;
  size?: 36 | 44 | 48;
  disabled?: boolean;
  accessibilityState?: AccessibilityState;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
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
}: IconButtonProps) {
  const { colors } = useTheme();
  const { fill, glyph, border, borderWidth } = iconButtonTone(colors, tone);
  const Glyph = directional ? DirectionalIcon : Icon;
  const targetSize = size === 48 ? 48 : ICON_BUTTON_TARGET_SIZE;
  const visualSize = size === 36 ? 36 : size === 48 ? 48 : 44;
  const iconSize = size === 36 ? 18 : size === 48 ? 24 : 22;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        {
          width: targetSize,
          height: targetSize,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            width: visualSize,
            height: visualSize,
            borderRadius: radius.none,
            borderWidth,
            borderColor: border,
            backgroundColor: fill,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          }}
        >
          {label ? (
            <AppText
              variant="bodyStrong"
              style={{ color: glyph }}
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
            >
              {label}
            </AppText>
          ) : icon ? (
            <Glyph name={icon} size={iconSize} color={glyph} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
