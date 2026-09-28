import type { PaletteColors } from '../theme/palettes';

/**
 * Coral button tones (spec §8). Kept free of React Native so the palette
 * guards can check every fill and label pair without a renderer, the same way
 * `recipe-thumb-tones.ts` does for the placeholder.
 */
export const BUTTON_VARIANTS = [
  'primary',
  'secondary',
  'ghost',
  'destructive',
  'inverse',
  /** @deprecated J: removed in C16 */
  'soft',
  /** @deprecated J: removed in C16 */
  'danger',
  /** @deprecated J: removed in C16 */
  'media',
] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonToneName = 'default' | 'danger';
export type JButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'inverse';

export const DEPRECATED_BUTTON_VARIANT_ALIASES = {
  /** @deprecated J: removed in C16 */
  soft: 'secondary',
  /** @deprecated J: removed in C16 */
  danger: 'destructive',
  /** @deprecated J: removed in C16 */
  media: 'inverse',
} as const satisfies Record<Exclude<ButtonVariant, JButtonVariant>, JButtonVariant>;

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

export function resolveButtonVariant(variant: ButtonVariant): JButtonVariant {
  return (
    DEPRECATED_BUTTON_VARIANT_ALIASES[variant as keyof typeof DEPRECATED_BUTTON_VARIANT_ALIASES] ??
    variant
  );
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

  if (variant === 'media') {
    return {
      fill: colors.textInverse,
      pressedFill: colors.textInverse,
      label: colors.onPrimaryInverse,
      border: colors.textInverse,
      borderWidth: 0,
    };
  }

  const resolved = resolveButtonVariant(variant);
  switch (resolved) {
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

/**
 * `IconButton` is the J name for the square icon primitive. `RoundButton`
 * keeps accepting its old tones as aliases until C16.
 */
export const ICON_BUTTON_TONES = [
  'plain',
  'surface',
  'outline',
  'coral',
  'inverse',
  'media',
] as const;

export type IconButtonTone = (typeof ICON_BUTTON_TONES)[number];

export const ROUND_BUTTON_TONES = [
  ...ICON_BUTTON_TONES,
  /** @deprecated J: removed in C16 */
  'sunk',
  /** @deprecated J: removed in C16 */
  'primary',
  /** @deprecated J: removed in C16 */
  'soft',
  /** @deprecated J: removed in C16 */
  'mediaLight',
] as const;

export type RoundButtonTone = (typeof ROUND_BUTTON_TONES)[number];

export const DEPRECATED_ROUND_BUTTON_TONE_ALIASES = {
  /** @deprecated J: removed in C16 */
  sunk: 'surface',
  /** @deprecated J: removed in C16 */
  primary: 'coral',
  /** @deprecated J: removed in C16 */
  soft: 'surface',
  /** @deprecated J: removed in C16 */
  mediaLight: 'media',
} as const satisfies Record<Exclude<RoundButtonTone, IconButtonTone>, IconButtonTone>;

export interface RoundButtonColors {
  fill: string;
  glyph: string;
  border: string;
  borderWidth: 0 | 1;
}

export function resolveRoundButtonTone(tone: RoundButtonTone): IconButtonTone {
  return (
    DEPRECATED_ROUND_BUTTON_TONE_ALIASES[
      tone as keyof typeof DEPRECATED_ROUND_BUTTON_TONE_ALIASES
    ] ?? tone
  );
}

export function iconButtonTone(colors: PaletteColors, tone: IconButtonTone): RoundButtonColors {
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
      return { fill: colors.bg, glyph: colors.text, border: colors.control, borderWidth: 1 };
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

export function roundButtonTone(colors: PaletteColors, tone: RoundButtonTone): RoundButtonColors {
  return iconButtonTone(colors, resolveRoundButtonTone(tone));
}
