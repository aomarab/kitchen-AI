import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { roundButtonTone, type RoundButtonTone } from './button-tones';
import { CHROME_MAX_FONT_SCALE } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { RoundButtonTone } from './button-tones';

export interface RoundButtonProps {
  accessibilityLabel: string;
  onPress?: () => void;
  icon?: IconName;
  /** Mirror the icon in RTL. Back and forward need it; close does not. */
  directional?: boolean;
  /** A short glyph drawn instead of an icon, such as the avatar's initial. */
  label?: string;
  tone?: RoundButtonTone;
  /** The visible circle. The touch target is 44×44 whatever this is (spec §12). */
  size?: 36 | 40 | 44;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Every round control under 44pt: back, close, the recipe controls, search and
 * the avatar. The Pressable is fixed at 44×44 and centres the circle, so a 36pt
 * visual never shrinks the target (spec §14).
 */
export function RoundButton({
  accessibilityLabel,
  onPress,
  icon,
  directional = false,
  label,
  tone = 'surface',
  size = 40,
  disabled = false,
  style,
  testID,
}: RoundButtonProps) {
  const { colors, isDark, shadow } = useTheme();
  const { fill, glyph, border } = roundButtonTone(colors, tone, isDark);
  const Glyph = directional ? DirectionalIcon : Icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {({ pressed }) => (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: fill,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
            tone === 'surface' && !isDark ? shadow.card : null,
          ]}
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
            <Glyph name={icon} size={Math.round(size / 2)} color={glyph} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
