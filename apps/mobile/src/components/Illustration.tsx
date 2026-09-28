import { type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ILLUSTRATION_PATHS, type IllustrationName } from './glyphs/illustration-paths';
import { illustrationStrokeWidth } from './glyphs/stroke';
import { useTheme } from '../theme/useTheme';

export interface IllustrationProps {
  name: IllustrationName;
  size: number;
  style?: StyleProp<ViewStyle>;
}

export function Illustration({ name, size, style }: IllustrationProps) {
  const { colors } = useTheme();
  const visualStrokeWidth = illustrationStrokeWidth(size);

  return (
    <Svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={style}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {ILLUSTRATION_PATHS[name].map(([d, tone], index) => (
        <Path
          key={`${name}-${index}`}
          d={d}
          stroke={tone === 'coral' ? colors.primaryArt : colors.text}
          strokeWidth={(visualStrokeWidth * 64) / size}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}
