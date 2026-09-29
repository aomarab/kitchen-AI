import type { PaletteColors } from '../theme/palettes';

/**
 * Coral button tones (spec §8). Kept free of React Native so the palette
 * guards can check every fill and label pair without a renderer.
 */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'destructive', 'inverse'] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonToneName = 'default' | 'danger';
export type JButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'inverse';

export interface ButtonTone {
  fill: string;
  pressedFill: string;
  label: string;
  /** The 1px edge. Equal to the fill wherever the fill is the edge. */
  border: string;
  borderWidth: 0 | 1 | 1.5;
}

export interface ButtonToneOptions {
  tone?: ButtonToneName;
  disabled?: boolean;
}

export function buttonTone(
  colors: PaletteColors,
  variant: ButtonVariant,
  { tone = 'default', disabled = false }: ButtonToneOptions = {},
): ButtonTone {
  if (disabled) {
    return {
      fill: colors.surfaceAlt,
      pressedFill: colors.surfaceAlt,
      label: colors.textMuted,
      border: colors.surfaceAlt,
      borderWidth: 0,
    };
  }

  switch (variant) {
    case 'primary':
      return {
        fill: colors.primary,
        pressedFill: colors.primaryPressed,
        label: colors.onFill,
        border: colors.primary,
        borderWidth: 0,
      };
    case 'secondary':
      return {
        fill: 'transparent',
        pressedFill: 'transparent',
        label: colors.primaryText,
        border: colors.primary,
        borderWidth: 1.5,
      };
    case 'ghost':
      return {
        fill: 'transparent',
        pressedFill: 'transparent',
        label: tone === 'danger' ? colors.danger : colors.text,
        border: 'transparent',
        borderWidth: 0,
      };
    case 'destructive':
      return {
        fill: colors.danger,
        pressedFill: colors.danger,
        label: colors.onDanger,
        border: colors.danger,
        borderWidth: 0,
      };
    case 'inverse':
      return {
        fill: colors.inverse,
        pressedFill: colors.inverse,
        label: colors.onInverse,
        border: colors.inverse,
        borderWidth: 0,
      };
  }
}

export const ICON_BUTTON_TONES = [
  'plain',
  'surface',
  'outline',
  'coral',
  'inverse',
  'media',
] as const;

export type IconButtonTone = (typeof ICON_BUTTON_TONES)[number];

export interface IconButtonColors {
  fill: string;
  glyph: string;
  border: string;
  borderWidth: 0 | 1;
}

export function iconButtonTone(colors: PaletteColors, tone: IconButtonTone): IconButtonColors {
  switch (tone) {
    case 'plain':
      return { fill: 'transparent', glyph: colors.text, border: 'transparent', borderWidth: 0 };
    case 'surface':
      return {
        fill: colors.surfaceAlt,
        glyph: colors.text,
        border: 'transparent',
        borderWidth: 0,
      };
    case 'outline':
      return { fill: colors.bg, glyph: colors.text, border: colors.border, borderWidth: 1 };
    case 'coral':
      return { fill: colors.primary, glyph: colors.onFill, border: colors.primary, borderWidth: 0 };
    case 'inverse':
      return {
        fill: colors.inverse,
        glyph: colors.onInverse,
        border: colors.inverse,
        borderWidth: 0,
      };
    case 'media':
      return {
        fill: colors.mediaButton,
        glyph: colors.textInverse,
        border: 'transparent',
        borderWidth: 0,
      };
  }
}
