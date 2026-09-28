import { View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { initialOf } from '../lib/initial';
import { CHROME_MAX_FONT_SCALE } from '../theme';
import { useTheme } from '../theme/useTheme';

export type AvatarSize = 32 | 40 | 56 | 80;

export interface AvatarProps {
  name: string | null | undefined;
  size?: 32 | 40 | 56 | 80;
}

function avatarVariant(size: AvatarSize): 'label' | 'bodyStrong' | 'title' {
  if (size === 32) return 'label';
  if (size === 40) return 'bodyStrong';
  return 'title';
}

export function Avatar({ name, size = 40 }: AvatarProps) {
  const { colors } = useTheme();
  const initial = initialOf(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initial ? (
        <AppText
          variant={avatarVariant(size)}
          color="primaryText"
          maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
        >
          {initial}
        </AppText>
      ) : (
        <Icon name="user" size={Math.round(size / 2)} color={colors.primaryText} />
      )}
    </View>
  );
}
