import type { Locale } from '@kitchen/i18n';
import type { Palette, ThemeMode, Tint } from './palettes';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export { paletteFor, palettes, THEME_FAMILIES, DEFAULT_THEME_FAMILY } from './palettes';
export type { Palette, PaletteColors, Tint, ThemeFamily, ThemeMode, ColorToken } from './palettes';

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
export function shadowFor(palette: Palette) {
  const { shadowColor, shadowScale } = palette;
  return {
    card: {
      shadowColor,
      shadowOpacity: 0.08 * shadowScale,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    raised: {
      shadowColor,
      shadowOpacity: 0.14 * shadowScale,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
  } as const;
}

export type Shadow = ReturnType<typeof shadowFor>;

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
} satisfies Record<
  string,
  { fontSize: number; fontWeight: TextStyleToken['fontWeight']; letterSpacing: number }
>;

export type TypographyVariant = keyof typeof SCALE;

/**
 * How far each tier may scale with the system font size.
 *
 * Chrome — pill buttons, field labels, badges — sits in fixed-height rows, so
 * it stops at 1.6x. Content is uncapped: at the largest accessibility sizes the
 * user has asked for very large text and long-form copy should give it to them.
 */
export const CHROME_MAX_FONT_SCALE = 1.6;
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

/**
 * Turns the stored preference into the mode actually rendered.
 *
 * Split out of the hook and kept free of React Native so it can be tested
 * directly: `useColorScheme` returns `null` before the OS has reported in, and
 * on that tick 'system' has to resolve to *something*. Light is the honest
 * default — it is what every install before the picker existed rendered — but
 * the branch is easy to write as `scheme !== 'light' ? 'dark' : 'light'`, which
 * flashes a dark screen at every cold start on a light phone.
 */
export function resolveThemeMode(
  preference: 'system' | ThemeMode,
  // Widened past `'light' | 'dark'` on purpose: React Native's
  // `ColorSchemeName` also carries `'unspecified'`, which must land on light
  // rather than being narrowed away at the call site with a cast.
  systemScheme: string | null | undefined,
): ThemeMode {
  if (preference !== 'system') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/**
 * Rotates the tints down a list so adjacent cards never repeat. Negative
 * indices wrap forwards rather than falling off the front of the tuple.
 *
 * Kept as a free function taking the tuple, so the palette guard can exercise
 * the wrapping arithmetic without standing up a React renderer.
 */
export function tintIn(tints: readonly Tint[], index: number): Tint {
  const count = tints.length;
  const wrapped = ((Math.trunc(index) % count) + count) % count;
  return tints[wrapped] ?? tints[0]!;
}
