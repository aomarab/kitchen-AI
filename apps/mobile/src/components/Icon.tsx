import { Text, type ColorValue, type StyleProp, type TextStyle } from 'react-native';

/**
 * Dependency-free glyph icons. A vector icon set (`@expo/vector-icons`) is not
 * installed in this workspace, so we render Unicode/emoji glyphs which display
 * consistently on iOS and Android without adding a package. Directional glyphs
 * (chevrons/arrows) are flipped for RTL by <DirectionalIcon>, never here.
 */
export const ICONS = {
  home: '\u{1F3E0}',
  kitchen: '\u{1F9FA}',
  plans: '\u{1F4C5}',
  more: '\u2026',
  camera: '\u{1F4F7}',
  barcode: '\u{1F4CA}',
  receipt: '\u{1F9FE}',
  manual: '\u270F\uFE0F',
  plus: '\uFF0B',
  search: '\u{1F50D}',
  check: '\u2713',
  close: '\u2715',
  clock: '\u23F1\uFE0F',
  trash: '\u{1F5D1}\uFE0F',
  edit: '\u270E',
  warning: '\u26A0\uFE0F',
  flame: '\u{1F525}',
  basket: '\u{1F6D2}',
  settings: '\u2699\uFE0F',
  user: '\u{1F464}',
  household: '\u{1F46A}',
  play: '\u25B6\uFE0F',
  apple: '\uF8FF',
  google: 'G',
  offline: '\u{1F4F5}',
  sync: '\u21BB',
  location: '\u{1F4CD}',
  swap: '\u21C4',
  chevron: '\u203A',
  chevronDown: '\u2304',
  back: '\u2039',
  arrowForward: '\u2192',
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 18, color, style }: IconProps) {
  return (
    <Text
      accessible={false}
      importantForAccessibility="no"
      style={[{ fontSize: size, lineHeight: size + 2, color }, style]}
    >
      {ICONS[name]}
    </Text>
  );
}
