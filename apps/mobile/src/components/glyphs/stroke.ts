import type { GlyphName } from './icon-paths';

export function iconStrokeWidth(size: number): number {
  return Math.max(1.75, (1.5 * 24) / size);
}

export function illustrationStrokeWidth(size: number): number {
  if (size >= 56) return 2;
  if (size >= 40) return 1.75;
  return 1.5;
}

export const BRAND_ICON_NAMES = ['apple', 'google'] as const;
export type BrandIconName = (typeof BRAND_ICON_NAMES)[number];

export type IconName = GlyphName | BrandIconName;

const BRAND_ICON_NAME_SET = new Set<string>(BRAND_ICON_NAMES);

export function isBrandIconName(name: IconName): name is BrandIconName {
  return BRAND_ICON_NAME_SET.has(name);
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
] as const satisfies readonly IconName[];

const DIRECTIONAL_ICON_NAME_SET = new Set<string>(DIRECTIONAL_ICON_NAMES);

export function isDirectionalIconName(name: IconName): boolean {
  return DIRECTIONAL_ICON_NAME_SET.has(name);
}
