import type { Locale } from '@kitchen/i18n';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export const colors = {
  /** The reference is white-led: the ground is paper, and colour arrives only
   *  in the tinted cards and the accents. */
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  /** The lavender card tint. Darkest surface, so it sets the contrast floor for
   *  every foreground token below. */
  surfaceAlt: '#F6F5FB',
  border: '#E9E7F2',
  text: '#2A2A5C',
  /** The reference's muted grey is #9791B3, which is 3.1:1 on white and fails
   *  AA for body text. Darkened until it passes while keeping the lilac cast. */
  textMuted: '#67618C',
  textInverse: '#FFFFFF',
  /** The reference's indigo. */
  primary: '#343375',
  primaryPressed: '#26254F',
  primarySoft: '#EFEEF9',
  // Cook mode inverts the screen, and the indigo on itself is 1:1 — the CTA
  // fill vanishes entirely. This light teal measures 8.10:1 on surfaceInverse.
  primaryInverse: '#7FD9D9',
  /** Teal is the chromatic accent. Mobile's `accent` is used as *text*, so it
   *  is the 4.5:1 weight; the reference's #479696 is 3.4:1 on white. */
  accent: '#2C7676',
  accentSoft: '#EAF4F4',
  warn: '#8A5209',
  warnSoft: '#FBF0E0',
  /** The reference's coral, pulled toward magenta so a white label clears AA. */
  danger: '#B32F51',
  dangerSoft: '#FDECF0',
  success: '#1E7A4C',
  successSoft: '#E4F3EA',
  /** Cook mode runs inverted. Named so the intent survives a palette change. */
  surfaceInverse: '#2A2A5C',
  textInverseMuted: '#B6B2D4',
  overlay: 'rgba(42,42,92,0.45)',
} as const;

/**
 * The reference fills cards with low-saturation tints rather than white, and
 * rotates through them down a list. Each tint carries its own foreground so a
 * caller never has to guess which text colour clears AA on it — `palette.spec`
 * asserts every pair. Solid colours, never an opacity tint: a translucent fill
 * composites against whatever is behind it and the contrast maths stops holding.
 */
export const tints = [
  { bg: '#F1EFFA', fg: '#3B3486', name: 'lavender' },
  { bg: '#E9F4EF', fg: '#1E6B4C', name: 'mint' },
  { bg: '#FCEDF1', fg: '#9E2F4F', name: 'blush' },
  { bg: '#EAF2F8', fg: '#245A80', name: 'sky' },
] as const;

export type Tint = (typeof tints)[number];

/**
 * The hero gradient, indigo running into a deep teal. Every stop — and every
 * colour interpolated between them — stays dark enough that `textInverse`,
 * `textInverseMuted` and `primaryInverse` all clear AA on it; the worst
 * interpolated point measures 5.03:1. The obvious brighter teal (#2C7676, the
 * accent) drops muted text to 2.60:1, so the ramp is deliberately darker than
 * the reference's. `palette.spec` samples the interpolation, not just the stops.
 */
export const gradientHero = ['#2A2A5C', '#2A4166', '#124747'] as const;

/** Rotates the tints down a list so adjacent cards never repeat. Negative
 *  indices wrap forwards rather than falling off the front of the tuple. */
export function tintFor(index: number): Tint {
  const count = tints.length;
  const wrapped = ((Math.trunc(index) % count) + count) % count;
  return tints[wrapped] ?? tints[0];
}

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
    shadowColor: '#2A2A5C',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#2A2A5C',
    shadowOpacity: 0.12,
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
