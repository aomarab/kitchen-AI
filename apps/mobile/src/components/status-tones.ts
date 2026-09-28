import type { PaletteColors } from '../theme/palettes';

export type JBadgeToneName = 'muted' | 'success' | 'warn' | 'danger' | 'primary';
export type BadgeToneName =
  | JBadgeToneName
  /** @deprecated J: removed in C16 */
  | 'neutral'
  /** @deprecated J: removed in C16 */
  | 'info';

export const DEPRECATED_BADGE_TONE_ALIASES = {
  /** @deprecated J: removed in C16 */
  neutral: 'muted',
  /** @deprecated J: removed in C16 */
  info: 'primary',
} as const satisfies Partial<Record<BadgeToneName, JBadgeToneName>>;

export interface BadgeToneSpec {
  fill: 'transparent';
  dot: string;
  label: string;
  dotSize: 6;
}

export type ProgressToneName = 'active' | 'paused' | 'idle';

export function resolveBadgeTone(tone: BadgeToneName): JBadgeToneName {
  return DEPRECATED_BADGE_TONE_ALIASES[tone as keyof typeof DEPRECATED_BADGE_TONE_ALIASES] ?? tone;
}

export function badgeTone(colors: PaletteColors, tone: BadgeToneName): BadgeToneSpec {
  const resolved = resolveBadgeTone(tone);
  const label =
    resolved === 'success'
      ? colors.success
      : resolved === 'warn'
        ? colors.warn
        : resolved === 'danger'
          ? colors.danger
          : resolved === 'primary'
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
