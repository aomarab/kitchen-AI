import type { Locale } from '@kitchen/i18n';
import type { Palette, ThemeMode } from './palettes';

/**
 * Design tokens. Kept flat and dependency-free so any component can pull colours,
 * spacing and typography from a single source. Physical-direction values are
 * never encoded here — spacing is symmetric and direction is handled with
 * logical style keys (start/end) at the call site.
 */

export { paletteFor, palettes } from './palettes';
export type { Palette, PaletteColors, Scrim, ThemeMode, ColorToken } from './palettes';
export {
  ThemeModeOverride,
  themeModeWithOverride,
  useThemeModeOverride,
} from './ThemeModeOverride';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  gutter: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  none: 0,
  shutter: 999,
} as const;

/**
 * J uses three shadows in light mode. Dark mode disables them completely
 * (including Android elevation); dark cards get separation from `cardEdge`.
 */
export function shadowFor(palette: Palette) {
  const { shadowColor, shadowScale } = palette;
  const hasShadow = shadowScale > 0;
  return {
    card: {
      shadowColor,
      shadowOpacity: 0.07 * shadowScale,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 6 },
      elevation: hasShadow ? 2 : 0,
    },
    raised: {
      shadowColor,
      shadowOpacity: 0.16 * shadowScale,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 10 },
      elevation: hasShadow ? 8 : 0,
    },
    sheet: {
      shadowColor,
      shadowOpacity: 0.1 * shadowScale,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: -8 },
      elevation: hasShadow ? 12 : 0,
    },
  } as const;
}

export type Shadow = ReturnType<typeof shadowFor>;

/**
 * Typography scale. Coral uses Tajawal for text in both scripts; numerals keep
 * Outfit Medium through `resolveFontFamily` for tabular figures.
 */
export interface TextStyleToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number;
  fontVariant?: 'tabular-nums'[];
}

interface LocaleTypeValues {
  fontSize: number;
  lineHeight: number;
}

interface ScaleEntry {
  en: LocaleTypeValues;
  ar: LocaleTypeValues;
  fontWeight: TextStyleToken['fontWeight'];
  letterSpacing: number;
  fontVariant?: TextStyleToken['fontVariant'];
}

const SCALE = {
  hero: {
    en: { fontSize: 34, lineHeight: 40 },
    ar: { fontSize: 30, lineHeight: 44 },
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  display: {
    en: { fontSize: 28, lineHeight: 34 },
    ar: { fontSize: 26, lineHeight: 38 },
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  title: {
    en: { fontSize: 22, lineHeight: 28 },
    ar: { fontSize: 20, lineHeight: 30 },
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  heading: {
    en: { fontSize: 18, lineHeight: 24 },
    ar: { fontSize: 17, lineHeight: 26 },
    fontWeight: '500',
    letterSpacing: 0,
  },
  bodyLarge: {
    en: { fontSize: 17, lineHeight: 27 },
    ar: { fontSize: 17, lineHeight: 30 },
    fontWeight: '400',
    letterSpacing: 0,
  },
  body: {
    en: { fontSize: 15, lineHeight: 22 },
    ar: { fontSize: 15, lineHeight: 26 },
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodyStrong: {
    en: { fontSize: 15, lineHeight: 22 },
    ar: { fontSize: 15, lineHeight: 26 },
    fontWeight: '500',
    letterSpacing: 0,
  },
  label: {
    en: { fontSize: 13, lineHeight: 18 },
    ar: { fontSize: 13, lineHeight: 22 },
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  caption: {
    en: { fontSize: 13, lineHeight: 18 },
    ar: { fontSize: 13, lineHeight: 22 },
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  small: {
    en: { fontSize: 12, lineHeight: 16 },
    ar: { fontSize: 12, lineHeight: 18 },
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  eyebrow: {
    en: { fontSize: 12, lineHeight: 16 },
    ar: { fontSize: 12, lineHeight: 18 },
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  button: {
    en: { fontSize: 15, lineHeight: 20 },
    ar: { fontSize: 15, lineHeight: 22 },
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  buttonSmall: {
    en: { fontSize: 13, lineHeight: 18 },
    ar: { fontSize: 13, lineHeight: 20 },
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  numeral: {
    en: { fontSize: 44, lineHeight: 48 },
    ar: { fontSize: 44, lineHeight: 52 },
    fontWeight: '500',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  numeralSmall: {
    en: { fontSize: 28, lineHeight: 32 },
    ar: { fontSize: 28, lineHeight: 36 },
    fontWeight: '500',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  tab: {
    en: { fontSize: 11, lineHeight: 14 },
    ar: { fontSize: 11, lineHeight: 16 },
    fontWeight: '500',
    letterSpacing: 0.1,
  },
} satisfies Record<string, ScaleEntry>;

export type TypographyVariant = keyof typeof SCALE;

/**
 * How far each tier may scale with the system font size.
 *
 * Chrome — buttons, labels, badges and tabs — sits in fixed-height rows, so it
 * stops at 1.6x. Content is uncapped.
 */
export const CHROME_MAX_FONT_SCALE = 1.6;
const CHROME_VARIANTS: readonly TypographyVariant[] = [
  'button',
  'buttonSmall',
  'label',
  'caption',
  'small',
  'eyebrow',
  'tab',
];

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
  const localeKey = isArabic ? 'ar' : 'en';
  const out = {} as Record<TypographyVariant, TextStyleToken>;
  for (const key of Object.keys(SCALE) as TypographyVariant[]) {
    const entry: (typeof SCALE)[TypographyVariant] = SCALE[key];
    const local = entry[localeKey];
    out[key] = {
      fontSize: local.fontSize,
      fontWeight: entry.fontWeight,
      lineHeight: local.lineHeight,
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
