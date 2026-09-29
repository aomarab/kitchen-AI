import type { PaletteColors } from '../theme/palettes';

export type BadgeToneName = 'muted' | 'success' | 'warn' | 'danger' | 'primary';

export interface BadgeToneSpec {
  fill: 'transparent';
  dot: string;
  label: string;
  dotSize: 6;
}

export type ProgressToneName = 'active' | 'paused' | 'idle';

export function badgeTone(colors: PaletteColors, tone: BadgeToneName): BadgeToneSpec {
  const label =
    tone === 'success'
      ? colors.success
      : tone === 'warn'
        ? colors.warn
        : tone === 'danger'
          ? colors.danger
          : tone === 'primary'
            ? colors.primaryText
            : colors.textMuted;
  return { fill: 'transparent', dot: label, label, dotSize: 6 };
}

export function progressTone(
  colors: PaletteColors,
  tone: ProgressToneName = 'active',
): { track: string; fill: string } {
  return { track: colors.border, fill: tone === 'active' ? colors.primary : colors.control };
}
