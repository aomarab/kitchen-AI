import type { Locale } from '@kitchen/i18n';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export const colors = {
  bg: '#EEF2F9',
  surface: '#FFFFFF',
  surfaceAlt: '#E3EBFB',
  border: '#D7DEE9',
  text: '#0F172A',
  textMuted: '#55637A',
  textInverse: '#FFFFFF',
  primary: '#2563EB',
  primaryPressed: '#1D4ED8',
  primarySoft: '#EBF2FE',
  // Cook mode inverts the screen, and #2563EB on #0F172A is 3.45:1 — under the
  // 4.5:1 a ghost label needs, so the CTA fill dulls and the label is hard
  // work. This lifted blue measures 9.90:1 on surfaceInverse both as text and
  // as a fill carrying a dark label.
  primaryInverse: '#93C5FD',
  accent: '#1D4ED8',
  accentSoft: '#DFE9FA',
  warn: '#92400E',
  warnSoft: '#F6EDE2',
  danger: '#B91C1C',
  dangerSoft: '#FBE9E9',
  success: '#047857',
  successSoft: '#E2F1EB',
  /** Cook mode runs inverted. Named so the intent survives a palette change. */
  surfaceInverse: '#0F172A',
  textInverseMuted: '#A9B8CF',
  overlay: 'rgba(15,23,42,0.45)',
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
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/**
 * Typography scale. Arabic runs at a larger line-height than Latin per spec §7,
 * and the `fontFamily` itself (Tajawal) is resolved per locale and
 * weight in `lib/fonts.ts` — text primitives call `resolveFontFamily` so nothing
 * here needs to know about font loading.
 */
export interface TextStyleToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number;
}

const LATIN_LINE_HEIGHT = 1.35;
const ARABIC_LINE_HEIGHT = 1.7;

/**
 * `letterSpacing` is a Latin-only device and is zeroed for Arabic below, the
 * same way line-height is switched. Arabic is cursive: spacing the letters
 * forces gaps into the joins.
 */
const SCALE = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.22 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.09 },
  heading: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.02 },
  body: { fontSize: 16, fontWeight: '400' as const, letterSpacing: 0 },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, letterSpacing: 0 },
  button: { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
  label: { fontSize: 14, fontWeight: '500' as const, letterSpacing: 0.1 },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.1 },
} satisfies Record<string, { fontSize: number; fontWeight: TextStyleToken['fontWeight']; letterSpacing: number }>;

export type TypographyVariant = keyof typeof SCALE;

export function typography(locale: Locale): Record<TypographyVariant, TextStyleToken> {
  const isArabic = locale === 'ar';
  const factor = isArabic ? ARABIC_LINE_HEIGHT : LATIN_LINE_HEIGHT;
  const out = {} as Record<TypographyVariant, TextStyleToken>;
  for (const key of Object.keys(SCALE) as TypographyVariant[]) {
    const entry = SCALE[key]!;
    out[key] = {
      fontSize: entry.fontSize,
      fontWeight: entry.fontWeight,
      lineHeight: Math.round(entry.fontSize * factor),
      letterSpacing: isArabic ? 0 : entry.letterSpacing,
    };
  }
  return out;
}

export const hitSlop = 12 as const;
