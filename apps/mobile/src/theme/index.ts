import type { Locale } from '@kitchen/i18n';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export const colors = {
  bg: '#F5F4F1',
  surface: '#FFFFFF',
  /** The warm sand band from the reference. Darkest surface, so it sets the
   *  contrast floor for every foreground token below. */
  surfaceAlt: '#F0E6DA',
  border: '#E3E0D9',
  text: '#12172B',
  textMuted: '#5A6072',
  textInverse: '#FFFFFF',
  /** The reference's action colour is the near-black navy of the FAB. */
  primary: '#141A31',
  primaryPressed: '#252C4A',
  primarySoft: '#E8E9EE',
  // Cook mode inverts the screen, and #141A31 on itself is 1:1 — the CTA fill
  // vanishes entirely. This light teal measures 10.16:1 on surfaceInverse both
  // as a ghost label and as a fill carrying a dark label (10.50:1).
  primaryInverse: '#6FD7DB',
  /** Teal is the one chromatic accent. Mobile's `accent` is used as *text*, so
   *  it is the 4.5:1 weight; the vivid #17B3B9 from the shot is 2.5:1 on white
   *  and would fail on every surface. */
  accent: '#0E6E71',
  accentSoft: '#E2F3F4',
  warn: '#8A4A0A',
  warnSoft: '#FAEDDD',
  danger: '#B33230',
  dangerSoft: '#FBE9E8',
  success: '#1E7A4C',
  successSoft: '#E3F2E8',
  /** Cook mode runs inverted. Named so the intent survives a palette change. */
  surfaceInverse: '#141A31',
  textInverseMuted: '#A9AFC2',
  overlay: 'rgba(20,26,49,0.45)',
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

/**
 * The reference rounds generously — cards read ~20px and controls are pills.
 * `xl` is the card radius; `pill` stays for chips and the FAB.
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

/**
 * Depth comes from soft diffused shadow rather than borders. Spread across two
 * layers on iOS; Android gets the matching `elevation`.
 */
export const shadow = {
  card: {
    shadowColor: '#141A31',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#141A31',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
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

/**
 * How far each tier may scale with the system font size.
 *
 * Chrome — pill buttons, field labels, badges — sits in fixed-height rows, so
 * it stops at 1.6x. Content is uncapped: at the largest accessibility sizes the
 * user has asked for very large text and long-form copy should give it to them.
 */
const CHROME_MAX_FONT_SCALE = 1.6;
const CHROME_VARIANTS: readonly TypographyVariant[] = ['button', 'label', 'caption'];

/**
 * Returned straight to React Native's `maxFontSizeMultiplier`, which accepts
 * `null`, `0`, or a number `>= 1` — hence `undefined` for uncapped rather than
 * a sentinel like `Infinity`, which that prop rejects.
 */
export function maxFontScaleFor(variant: TypographyVariant): number | undefined {
  return CHROME_VARIANTS.includes(variant) ? CHROME_MAX_FONT_SCALE : undefined;
}

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
