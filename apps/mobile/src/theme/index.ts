import type { Locale } from '@kitchen/i18n';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export const colors = {
  /** The page. Sampled from the requested reference, whose grounds measure
   *  #eef0f2–#f5f7fb across three screens with pure-white cards on top; this is
   *  their neutral centre, carrying two units of blue so the violet family
   *  still owns the screen. Not pure white: a white page and a white card are
   *  the same surface, and the card stops existing — `palette.spec` holds them
   *  apart. */
  bg: '#F4F4F8',
  surface: '#FFFFFF',
  /** Deepened when the page went near-white. At #F6F0FE it measured 7.5 from
   *  the new ground — an `alt` card that had quietly stopped being a card,
   *  which the surface-separation guard caught on its first run. */
  surfaceAlt: '#EDE6FB',
  /** Neutralised when the page went near-white. At the old lavender #D9C9F5 a
   *  card's outline was more saturated than either surface it sat between, so
   *  white cards on a near-white page picked up a visible purple fringe. Same
   *  lightness, violet only as a cast. */
  border: '#E2DFE9',
  /** The kit sets body copy in pure black. Carrying a little of the violet
   *  into it keeps the screen feeling like one family. */
  text: '#1B1130',
  textMuted: '#584D75',
  textInverse: '#FFFFFF',
  /** The kit's violet, verbatim: measured at 90% of the CTA fill's interior
   *  pixels, so this is the real value and not an antialiased edge. */
  primary: '#814BE3',
  primaryPressed: '#6229C4',
  primarySoft: '#F4EDFE',
  /** Cook mode inverts, where `primary` sits at 1.2:1 and the fill vanishes. */
  primaryInverse: '#D6C2FF',
  /** The kit's chart/chat blue is #3478F7, which is 3.1:1 on white and fails
   *  AA as text. Darkened until it passes while staying the same blue. */
  accent: '#2F5FD0',
  accentSoft: '#E7EEFD',
  /** The kit's amber #F6C855 is a chart fill, far too light to set text in. */
  warn: '#845309',
  warnSoft: '#FCF0D9',
  danger: '#B32F51',
  dangerSoft: '#FDECF0',
  success: '#1E7A4C',
  successSoft: '#E4F3EA',
  /** Cook mode runs inverted. Named so the intent survives a palette change. */
  surfaceInverse: '#1E1236',
  textInverseMuted: '#B9A9D9',
  overlay: 'rgba(27,17,48,0.45)',
} as const;

/**
 * The reference fills cards with low-saturation tints rather than white, and
 * rotates through them down a list. Each tint carries its own foreground so a
 * caller never has to guess which text colour clears AA on it — `palette.spec`
 * asserts every pair. Solid colours, never an opacity tint: a translucent fill
 * composites against whatever is behind it and the contrast maths stops holding.
 */
export const tints = [
  { bg: '#DED0FA', fg: '#5B21B6', name: 'lavender' },
  { bg: '#E6F5EE', fg: '#166B48', name: 'mint' },
  { bg: '#FCE9F1', fg: '#9C2A5C', name: 'blush' },
  { bg: '#DCE8FA', fg: '#1F4FA8', name: 'sky' },
] as const;

export type Tint = (typeof tints)[number];

/**
 * The hero gradient, deep violet running up toward the brand violet. Every
 * stop — and every colour interpolated between them — stays dark enough that
 * `textInverse`, `textInverseMuted` and `primaryInverse` all clear AA on it;
 * the worst interpolated point measures 4.58:1.
 *
 * Ending on the kit's own #814BE3 is the tempting move and it does not work:
 * that violet is light enough to drop `primaryInverse` to 2.79:1, so the ghost
 * button's label on the hero would fail. The ramp stops at #5320A6, the
 * lightest violet that still carries all three. `palette.spec` samples the
 * interpolation rather than the three stops, because a gradient's midpoint can
 * be lighter than either end it was mixed from.
 */
export const gradientHero = ['#2E1065', '#3F1C87', '#5320A6'] as const;

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
 * layers on iOS; Android gets the matching `elevation`. Opacities were lifted
 * when the page went near-white: against the old lavender the card's white fill
 * carried most of the separation on its own and the shadow only had to hint.
 * White-on-near-white leaves the shadow doing that work alone.
 */
export const shadow = {
  card: {
    shadowColor: '#1B1130',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#1B1130',
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
