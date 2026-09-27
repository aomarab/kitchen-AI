import type { Locale } from '@kitchen/i18n';
import type { Palette, ThemeMode, Tint, TintName } from './palettes';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export { paletteFor, palettes } from './palettes';
export type {
  Palette,
  PaletteColors,
  Scrim,
  Tint,
  TintName,
  ThemeMode,
  ColorToken,
} from './palettes';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Apricot rounds generously (spec §6.7): `xl` is the bento tile, `lg` the group
 * card, chat bubble and sheet, `md` inputs and thumbnails. Buttons, chips, the
 * composer and the tab bar are pills.
 */
export const radius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 28,
  pill: 999,
} as const;

/**
 * Tiles separate from the cream page by fill, so the card shadow only hints.
 * `raised` is for what floats: the tab bar, the camera button, sheets and the
 * orb's bubble on the camera. Android gets the matching `elevation`.
 */
export function shadowFor(palette: Palette) {
  const { shadowColor, shadowScale } = palette;
  return {
    card: {
      shadowColor,
      shadowOpacity: 0.05 * shadowScale,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
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
  /** Only on `numeral`: counts that tick must not jitter as digits change width. */
  fontVariant?: 'tabular-nums'[];
}

const LATIN_LINE_HEIGHT = 1.35;
const ARABIC_LINE_HEIGHT = 1.7;

/**
 * `letterSpacing` is a Latin-only device and is zeroed for Arabic below, the
 * same way line-height is switched. Arabic is cursive: spacing the letters
 * forces gaps into the joins.
 */
const SCALE = {
  hero: { fontSize: 34, fontWeight: '600' as const, letterSpacing: -0.68 },
  display: { fontSize: 28, fontWeight: '600' as const, letterSpacing: -0.56 },
  title: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.33 },
  heading: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.18 },
  body: { fontSize: 16, fontWeight: '400' as const, letterSpacing: 0 },
  bodyStrong: { fontSize: 16, fontWeight: '500' as const, letterSpacing: 0 },
  numeral: {
    fontSize: 40,
    fontWeight: '700' as const,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums' as const],
  },
  button: { fontSize: 16, fontWeight: '600' as const, letterSpacing: 0.1 },
  label: { fontSize: 14, fontWeight: '500' as const, letterSpacing: 0.1 },
  caption: { fontSize: 13, fontWeight: '400' as const, letterSpacing: 0.1 },
} satisfies Record<
  string,
  {
    fontSize: number;
    fontWeight: TextStyleToken['fontWeight'];
    letterSpacing: number;
    fontVariant?: TextStyleToken['fontVariant'];
  }
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
    const entry: (typeof SCALE)[TypographyVariant] = SCALE[key];
    out[key] = {
      fontSize: entry.fontSize,
      fontWeight: entry.fontWeight,
      lineHeight: Math.round(entry.fontSize * factor),
      letterSpacing: isArabic ? 0 : entry.letterSpacing,
      ...('fontVariant' in entry ? { fontVariant: [...entry.fontVariant] } : null),
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

/**
 * The tint with a fixed role, such as the butter count tile or the sage plan
 * tile (spec §5.3). Rotation (`tintIn`) is for lists; a tile whose colour means
 * something asks for it by name.
 */
export function tintNamed(tints: readonly Tint[], name: TintName): Tint {
  return tints.find((tint) => tint.name === name) ?? tints[0]!;
}
