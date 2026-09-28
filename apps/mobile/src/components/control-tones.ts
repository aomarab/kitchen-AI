import type { PaletteColors } from '../theme/palettes';

/**
 * Fill and label pairs for the small Apricot controls (spec §8.4): chips, the
 * count badge, the stepper circles and the segmented control. Pure, like
 * `button-tones.ts`, so `controls.spec.ts` can hold each pair to AA in both
 * modes without a renderer.
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
  if (selected) return { fill: colors.text, label: colors.bg, border: colors.text };
  // The edge is kept in both modes: most chips sit on a white card.
  return { fill: colors.surface, label: colors.text, border: colors.border };
}

export function countBadgeTone(colors: PaletteColors): { fill: string; label: string } {
  return { fill: colors.text, label: colors.bg };
}

export function stepperTone(
  colors: PaletteColors,
  action: 'decrement' | 'increment',
): { fill: string; glyph: string } {
  return action === 'increment'
    ? { fill: colors.primary, glyph: colors.onFill }
    : { fill: colors.surfaceAlt, glyph: colors.text };
}

export function segmentTrack(colors: PaletteColors, tone: SegmentTone = 'default'): string {
  return tone === 'media' ? colors.surfaceInverseAlt : colors.surfaceAlt;
}

export function segmentTone(
  colors: PaletteColors,
  selected: boolean,
  isDark = false,
  tone: SegmentTone = 'default',
): ControlTone {
  if (tone === 'media') {
    if (!selected) {
      return { fill: 'transparent', label: colors.textInverseMuted, border: 'transparent' };
    }
    return {
      fill: colors.textInverse,
      label: colors.onPrimaryInverse,
      border: colors.textInverse,
    };
  }
  if (!selected) return { fill: 'transparent', label: colors.textMuted, border: 'transparent' };
  // The thumb lifts off the track by its shadow in light mode and its edge in dark.
  return {
    fill: colors.surface,
    label: colors.text,
    border: isDark ? colors.border : colors.surface,
  };
}
