import type { GlyphName } from './icon-paths';

export function iconStrokeWidth(size: number): number {
  return Math.max(1.75, (1.5 * 24) / size);
}

export function illustrationStrokeWidth(size: number): number {
  if (size >= 56) return 2;
  if (size >= 40) return 1.75;
  return 1.5;
}

export const LEGACY_ICON_NAMES = [
  'home',
  'kitchen',
  'plans',
  'more',
  'camera',
  'cameraReverse',
  'flash',
  'images',
  'barcode',
  'receipt',
  'manual',
  'plus',
  'minus',
  'search',
  'check',
  'close',
  'clock',
  'calendar',
  'trash',
  'edit',
  'warning',
  'info',
  'flame',
  'leaf',
  'star',
  'starOutline',
  'basket',
  'share',
  'restaurant',
  'settings',
  'bell',
  'user',
  'household',
  'play',
  'mic',
  'micOff',
  'send',
  'captions',
  'apple',
  'google',
  'wallet',
  'sparkles',
  'offline',
  'sync',
  'location',
  'snowflake',
  'box',
  'swap',
  'chevron',
  'chevronDown',
  'back',
  'arrowForward',
  'water',
  'stretch',
  'sunrise',
  'pause',
  'timerPause',
  'screen',
] as const;

export type LegacyIconName = (typeof LEGACY_ICON_NAMES)[number];

export const BRAND_ICON_NAMES = ['apple', 'google'] as const;
export type BrandIconName = (typeof BRAND_ICON_NAMES)[number];

export type IconName = GlyphName | LegacyIconName;

type AliasName = Exclude<LegacyIconName, BrandIconName>;

export const LEGACY_ICON_ALIASES = {
  home: 'home',
  kitchen: 'fridge',
  plans: 'calendar',
  more: 'more',
  camera: 'camera',
  cameraReverse: 'flip',
  flash: 'zap',
  images: 'image',
  barcode: 'barcode',
  receipt: 'receipt',
  manual: 'keyboard',
  plus: 'plus',
  minus: 'minus',
  search: 'search',
  check: 'check',
  close: 'x',
  clock: 'clock',
  calendar: 'calendar',
  trash: 'trash',
  edit: 'pencil',
  warning: 'alert',
  info: 'info',
  flame: 'flame',
  leaf: 'leaf',
  star: 'star',
  starOutline: 'star',
  basket: 'bag',
  share: 'share',
  restaurant: 'utensils',
  settings: 'settings',
  bell: 'bell',
  user: 'user',
  household: 'users',
  play: 'play',
  mic: 'mic',
  micOff: 'micOff',
  send: 'send',
  captions: 'captions',
  wallet: 'coins',
  sparkles: 'coins',
  offline: 'wifiOff',
  sync: 'refresh',
  location: 'pin',
  snowflake: 'box',
  box: 'box',
  swap: 'shuffle',
  chevron: 'chevR',
  chevronDown: 'chevD',
  back: 'chevL',
  arrowForward: 'arrowR',
  water: 'droplet',
  stretch: 'activity',
  sunrise: 'sun',
  pause: 'coffee',
  timerPause: 'pause',
  screen: 'tablet',
} satisfies Record<AliasName, GlyphName>;

const BRAND_ICON_NAME_SET = new Set<string>(BRAND_ICON_NAMES);

export function isBrandIconName(name: IconName): name is BrandIconName {
  return BRAND_ICON_NAME_SET.has(name);
}

export function resolveGlyphName(name: Exclude<IconName, BrandIconName>): GlyphName {
  return LEGACY_ICON_ALIASES[name as AliasName] ?? (name as GlyphName);
}

export function isFilledGlyphName(name: IconName): boolean {
  return name === 'star';
}

export const DIRECTIONAL_ICON_NAMES = [
  'chevL',
  'chevR',
  'arrowL',
  'arrowR',
  'send',
  'logout',
  'chevron',
  'back',
  'arrowForward',
] as const satisfies readonly IconName[];

const DIRECTIONAL_ICON_NAME_SET = new Set<string>(DIRECTIONAL_ICON_NAMES);

export function isDirectionalIconName(name: IconName): boolean {
  return DIRECTIONAL_ICON_NAME_SET.has(name);
}
