import type { PaletteColors } from '../theme/palettes';

/**
 * The Apricot button variants (spec §8.5). Kept free of React Native so the
 * palette guards can check every fill and label pair without a renderer, the
 * same way `recipe-thumb-tones.ts` does for the placeholder.
 */
export const BUTTON_VARIANTS = [
  'primary',
  'secondary',
  'soft',
  'ghost',
  'danger',
  'media',
] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonTone {
  fill: string;
  pressedFill: string;
  label: string;
  /** The 1px edge. Equal to the fill wherever the fill is the edge. */
  border: string;
}

export function buttonTone(colors: PaletteColors, variant: ButtonVariant): ButtonTone {
  switch (variant) {
    case 'primary':
      // Coral takes an ink label in both modes: white on it is 2.83:1 (§3).
      return {
        fill: colors.primary,
        pressedFill: colors.primaryPressed,
        label: colors.onFill,
        border: colors.primary,
      };
    case 'secondary':
      return {
        fill: colors.surface,
        pressedFill: colors.surface,
        label: colors.text,
        border: colors.border,
      };
    case 'soft':
      return {
        fill: colors.primarySoft,
        pressedFill: colors.primarySoft,
        label: colors.primaryText,
        border: colors.primarySoft,
      };
    case 'ghost':
      return {
        fill: 'transparent',
        pressedFill: 'transparent',
        label: colors.primaryText,
        border: 'transparent',
      };
    case 'danger':
      // Not `onFill`: the light-mode red takes white, so the destructive fill
      // carries its own label token.
      return {
        fill: colors.danger,
        pressedFill: colors.danger,
        label: colors.onDanger,
        border: colors.danger,
      };
    case 'media':
      // On the camera, the still and photos, which are dark in every mode.
      return {
        fill: colors.textInverse,
        pressedFill: colors.textInverse,
        label: colors.onPrimaryInverse,
        border: colors.textInverse,
      };
  }
}

/**
 * The fills a `RoundButton` circle takes (spec §14, "Small controls"): back
 * and close on the page, the same inside a card or sheet, the brand action,
 * the avatar, and controls over the camera or a photo.
 */
export const ROUND_BUTTON_TONES = [
  'surface',
  'sunk',
  'primary',
  'soft',
  'media',
  'mediaLight',
] as const;

export type RoundButtonTone = (typeof ROUND_BUTTON_TONES)[number];

export interface RoundButtonColors {
  fill: string;
  glyph: string;
  border: string;
}

export function roundButtonTone(
  colors: PaletteColors,
  tone: RoundButtonTone,
  isDark = false,
): RoundButtonColors {
  switch (tone) {
    case 'surface':
      // White on the cream page separates by its shadow in light mode. Dark
      // mode has no visible shadow, so the edge is drawn instead.
      return {
        fill: colors.surface,
        glyph: colors.text,
        border: isDark ? colors.border : colors.surface,
      };
    case 'sunk':
      // Inside a card or a sheet, where a `surface` circle would vanish.
      return { fill: colors.surfaceAlt, glyph: colors.text, border: colors.surfaceAlt };
    case 'primary':
      return { fill: colors.primary, glyph: colors.onFill, border: colors.primary };
    case 'soft':
      return { fill: colors.primarySoft, glyph: colors.primaryText, border: colors.primarySoft };
    case 'media':
      return {
        fill: colors.surfaceInverseAlt,
        glyph: colors.textInverse,
        border: colors.borderInverse,
      };
    case 'mediaLight':
      return {
        fill: colors.textInverse,
        glyph: colors.onPrimaryInverse,
        border: colors.textInverse,
      };
  }
}
