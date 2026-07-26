import type { Locale } from '@kitchen/i18n';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export const colors = {
  bg: '#FBF7F0',
  surface: '#FFFFFF',
  surfaceAlt: '#F3ECE1',
  border: '#E7DECF',
  text: '#241C15',
  textMuted: '#7A6E60',
  textInverse: '#FFFFFF',
  primary: '#C4562B',
  primaryPressed: '#A8461F',
  primarySoft: '#F7E3D8',
  accent: '#2E6E4E',
  accentSoft: '#DCEBE0',
  warn: '#B8860B',
  warnSoft: '#F6EBCB',
  danger: '#B23B2E',
  dangerSoft: '#F6DAD4',
  success: '#2E6E4E',
  successSoft: '#DCEBE0',
  overlay: 'rgba(28,20,14,0.45)',
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
