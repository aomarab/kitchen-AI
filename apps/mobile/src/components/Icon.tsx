import { type ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ColorValue, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../theme/useTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The app's icon set, backed by Ionicons (`@expo/vector-icons`). A single map
 * keeps every screen decoupled from the underlying glyph names. Directional
 * icons (chevrons/arrows) are mirrored for RTL by <DirectionalIcon>, never here.
 */
export const IONICONS = {
  home: 'home-outline',
  kitchen: 'file-tray-stacked-outline',
  plans: 'calendar-outline',
  more: 'ellipsis-horizontal',
  camera: 'camera-outline',
  cameraReverse: 'camera-reverse-outline',
  barcode: 'barcode-outline',
  receipt: 'receipt-outline',
  manual: 'create-outline',
  plus: 'add',
  minus: 'remove',
  search: 'search-outline',
  check: 'checkmark',
  close: 'close',
  clock: 'time-outline',
  calendar: 'calendar-outline',
  trash: 'trash-outline',
  edit: 'pencil-outline',
  warning: 'warning-outline',
  flame: 'flame-outline',
  star: 'star',
  starOutline: 'star-outline',
  basket: 'basket-outline',
  restaurant: 'restaurant-outline',
  settings: 'settings-outline',
  bell: 'notifications-outline',
  user: 'person-outline',
  household: 'people-outline',
  play: 'play',
  mic: 'mic-outline',
  micOff: 'mic-off-outline',
  captions: 'chatbox-ellipses-outline',
  apple: 'logo-apple',
  google: 'logo-google',
  wallet: 'wallet-outline',
  sparkles: 'sparkles-outline',
  offline: 'cloud-offline',
  sync: 'sync',
  location: 'location-outline',
  swap: 'swap-horizontal',
  chevron: 'chevron-forward',
  chevronDown: 'chevron-down',
  back: 'chevron-back',
  arrowForward: 'arrow-forward',
  water: 'water-outline',
  stretch: 'body-outline',
  sunrise: 'sunny-outline',
  pause: 'cafe-outline',
  screen: 'tablet-landscape-outline',
} satisfies Record<string, IoniconName>;

export type IconName = keyof typeof IONICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 18, color, style }: IconProps) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={IONICONS[name]}
      size={size}
      // Ionicons has no default colour of its own: an omitted `color` reaches
      // React Native as `undefined` and renders pure black, which was merely
      // off-palette while every screen was light and is invisible now that
      // three of the six palettes have near-black grounds.
      color={color ?? colors.text}
      style={style}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
