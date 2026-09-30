import type { IconName } from './Icon';
import type { PaletteColors } from '../theme/palettes';

/**
 * Fill and label pairs for Coral controls (spec §8). Pure, like
 * `button-tones.ts`, so `controls.spec.ts` can hold each pair to contrast
 * requirements in both modes without a renderer.
 */
export const CHIP_VARIANTS = ['pill', 'tag'] as const;

export type ChipVariant = (typeof CHIP_VARIANTS)[number];
export type ChipTone = 'default' | 'primary';

export interface ControlTone {
  fill: string;
  label: string;
  border: string;
}

export type SegmentTone = 'default' | 'media';

export function chipTone(
  colors: PaletteColors,
  variant: ChipVariant,
  selected: boolean,
  tone: ChipTone = 'default',
): ControlTone {
  if (tone === 'primary') {
    return { fill: colors.primary, label: colors.onFill, border: colors.primary };
  }
  if (variant === 'tag') {
    // The location tag inside a tile, which is never selectable.
    return { fill: colors.surface, label: colors.textMuted, border: colors.surface };
  }
  if (selected) return { fill: colors.primary, label: colors.onFill, border: 'transparent' };
  return { fill: colors.bg, label: colors.text, border: colors.border };
}

export function countBadgeTone(colors: PaletteColors): { fill: string; label: string } {
  return { fill: colors.text, label: colors.bg };
}

export function stepperTone(
  colors: PaletteColors,
  _action: 'decrement' | 'increment',
  disabled = false,
): { fill: string; glyph: string } {
  return { fill: 'transparent', glyph: disabled ? colors.textMuted : colors.text };
}

export function segmentTrack(colors: PaletteColors, tone: SegmentTone = 'default'): string {
  return tone === 'media' ? colors.surfaceInverseAlt : colors.bg;
}

export function segmentTone(
  colors: PaletteColors,
  selected: boolean,
  _isDark = false,
  tone: SegmentTone = 'default',
): ControlTone {
  if (tone === 'media') {
    if (!selected) {
      return { fill: 'transparent', label: colors.textInverse, border: 'transparent' };
    }
    return {
      fill: colors.textInverse,
      label: colors.surfaceInverse,
      border: colors.textInverse,
    };
  }
  if (!selected) return { fill: 'transparent', label: colors.text, border: 'transparent' };
  return {
    fill: colors.inverse,
    label: colors.onInverse,
    border: colors.inverse,
  };
}

export function checkboxTone(
  colors: PaletteColors,
  checked: boolean,
): { fill: string; border: string; glyph: string } {
  if (checked) return { fill: colors.primary, border: colors.primary, glyph: colors.onFill };
  return { fill: colors.bg, border: colors.control, glyph: 'transparent' };
}

export function toggleTone(colors: PaletteColors, value: boolean): { track: string; knob: string } {
  return { track: value ? colors.primary : colors.control, knob: colors.onFill };
}

export function starTone(
  colors: PaletteColors,
  filled: boolean,
): { glyph: string; icon: Extract<IconName, 'star'>; filled: boolean } {
  return { glyph: filled ? colors.primary : colors.control, icon: 'star', filled };
}
