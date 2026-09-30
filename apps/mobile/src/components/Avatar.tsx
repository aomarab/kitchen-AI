import { View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { roundButtonTone } from './button-tones';
import { initialOf } from '../lib/initial';
import { CHROME_MAX_FONT_SCALE } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface AvatarProps {
  name: string | null | undefined;
  size?: number;
}

/**
 * The user's initial on `primarySoft`, for places where the avatar is a picture
 * rather than a control, such as the Account header row. The tappable one in
 * tab headers is `AccountButton`; both take their colours from the `soft`
 * round-button tone so they cannot drift apart.
 */
export function Avatar({ name, size = 44 }: AvatarProps) {
  const { colors } = useTheme();
  const { fill, glyph } = roundButtonTone(colors, 'soft');
  const initial = initialOf(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initial ? (
        <AppText
          variant="heading"
          style={{ color: glyph }}
          maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
        >
          {initial}
        </AppText>
      ) : (
        <Icon name="user" size={Math.round(size / 2)} color={glyph} />
      )}
    </View>
  );
}
