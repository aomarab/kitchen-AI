import { type ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ColorValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ICON_PATHS, type GlyphName } from './glyphs/icon-paths';
import {
  iconStrokeWidth,
  isBrandIconName,
  isFilledGlyphName,
  type BrandIconName,
  type IconName,
} from './glyphs/stroke';
import { useTheme } from '../theme/useTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const BRAND_IONICONS = {
  apple: 'logo-apple',
  google: 'logo-google',
} satisfies Record<BrandIconName, IoniconName>;

export type { IconName };

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 18, color, style }: IconProps) {
  const { colors } = useTheme();
  const iconColor = color ?? colors.text;

  if (isBrandIconName(name)) {
    return (
      <Ionicons
        name={BRAND_IONICONS[name]}
        size={size}
        color={iconColor}
        style={style}
        accessible={false}
        importantForAccessibility="no"
      />
    );
  }

  const glyphName = name as GlyphName;
  const filled = isFilledGlyphName(name);

  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style as StyleProp<ViewStyle>}
      accessible={false}
      importantForAccessibility="no"
    >
      {ICON_PATHS[glyphName].map((d, index) => (
        <Path
          key={`${glyphName}-${index}`}
          d={d}
          stroke={iconColor}
          strokeWidth={iconStrokeWidth(size)}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={filled ? iconColor : 'none'}
        />
      ))}
    </Svg>
  );
}
