import type { Locale } from '@kitchen/i18n';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export const colors = {
  bg: '#F4EDE4',
  surface: '#FFFFFF',
  surfaceAlt: '#F9F0FF',
  border: '#E6E6E6',
  text: '#1D1D1D',
  textMuted: '#696969',
  textInverse: '#FFFFFF',
  primary: '#4A154B',
  primaryPressed: '#611F69',
  primarySoft: '#EDE8ED',
  // Cook mode inverts the screen, and #4A154B on #1D1D1D is 1.20:1 — the CTA
  // fill vanishes and the ghost label is unreadable. This is the same lifted
  // aubergine the web dark theme uses for --primary-text, and it measures
  // 7.72:1 on surfaceInverse both as text and as a fill carrying a dark label.
  primaryInverse: '#C9A3CE',
  accent: '#1264A3',
  accentSoft: '#E3EDF6',
  warn: '#8A5300',
  warnSoft: '#F3EEE6',
  danger: '#BF3A10',
  dangerSoft: '#FAEFEC',
  success: '#007A5A',
  successSoft: '#EBF4F2',
  /** Cook mode runs inverted. Named so the intent survives a palette change. */
  surfaceInverse: '#1D1D1D',
  textInverseMuted: '#C7C7C7',
  overlay: 'rgba(26,14,27,0.45)',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/**
 * Typography scale. Arabic runs at a larger line-height than Latin per spec §7,
 * and the `fontFamily` itself (IBM Plex Sans Arabic) is resolved per locale and
 * weight in `lib/fonts.ts` — text primitives call `resolveFontFamily` so nothing
 * here needs to know about font loading.
 */
export interface TextStyleToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
}

const LATIN_LINE_HEIGHT = 1.35;
const ARABIC_LINE_HEIGHT = 1.7;

const SCALE: Record<string, { fontSize: number; fontWeight: TextStyleToken['fontWeight'] }> = {
  display: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  bodyStrong: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '500' },
};

export type TypographyVariant = keyof typeof SCALE;

export function typography(locale: Locale): Record<TypographyVariant, TextStyleToken> {
  const factor = locale === 'ar' ? ARABIC_LINE_HEIGHT : LATIN_LINE_HEIGHT;
  const out = {} as Record<TypographyVariant, TextStyleToken>;
  for (const key of Object.keys(SCALE) as TypographyVariant[]) {
    const entry = SCALE[key]!;
    out[key] = {
      fontSize: entry.fontSize,
      fontWeight: entry.fontWeight,
      lineHeight: Math.round(entry.fontSize * factor),
    };
  }
  return out;
}

export const hitSlop = 12 as const;
