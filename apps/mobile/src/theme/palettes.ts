/**
 * The six palettes behind the theme picker: three colour families, each in a
 * light and a dark mode.
 *
 * Every value here is verified by `palette.spec.ts`, which runs the same
 * contrast assertions across all six. Two of the tokens exist only because a
 * single palette cannot serve both modes:
 *
 * - `primary` is a *fill*; `primaryText` is the same hue as *text*. In light
 *   mode the fill is dark and the label on it is white. In dark mode that
 *   inverts — a violet dark enough for a white label is invisible against a
 *   dark page — so `primary` becomes light and its label becomes dark. Web
 *   already draws this distinction (`text-primary` vs `text-primary-text`).
 * - `onFill` is the label for any saturated fill (`primary`, `primaryPressed`,
 *   `danger`). It follows the fill, not the page: white in light mode, near
 *   black in dark mode.
 *
 * The `*Inverse` group is different again. Cook mode and the hero card are dark
 * in every theme *and every mode*, so those tokens are tinted by the family but
 * are identical across light and dark. `onPrimaryInverse` is the label on the
 * cook-mode fill, and is always dark for the same reason.
 */

export interface Tint {
  readonly bg: string;
  readonly fg: string;
  readonly name: string;
}

export interface PaletteColors {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly primaryPressed: string;
  readonly primarySoft: string;
  readonly onFill: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly warn: string;
  readonly warnSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly success: string;
  readonly successSoft: string;
  readonly surfaceInverse: string;
  /** Lifted fill on the always-dark cook surface (badges, secondary buttons). */
  readonly surfaceInverseAlt: string;
  /** Outline on the always-dark cook surface. */
  readonly borderInverse: string;
  readonly textInverse: string;
  readonly textInverseMuted: string;
  readonly primaryInverse: string;
  readonly onPrimaryInverse: string;
  readonly overlay: string;
}

export interface Palette {
  readonly colors: PaletteColors;
  readonly tints: readonly Tint[];
  readonly gradientHero: readonly string[];
  /** Dark pages get a black shadow that no one can see, so depth moves onto
   *  the border instead and the shadow is dialled back to a faint halo. */
  readonly shadowColor: string;
  readonly shadowScale: number;
}

export type ThemeFamily = 'violet' | 'terracotta' | 'green';
export type ThemeMode = 'light' | 'dark';

/** Constant across light and dark: these surfaces are always dark. */
const VIOLET_INVERSE = {
  surfaceInverse: '#1E1236',
  textInverse: '#FFFFFF',
  textInverseMuted: '#B9A9D9',
  surfaceInverseAlt: '#3A2860',
  borderInverse: '#7259A8',
  primaryInverse: '#D6C2FF',
  onPrimaryInverse: '#1B1130',
} as const;

const CLAY_INVERSE = {
  surfaceInverse: '#331409',
  textInverse: '#FFFFFF',
  textInverseMuted: '#E7C1AB',
  surfaceInverseAlt: '#5C2F1D',
  borderInverse: '#9E5D40',
  primaryInverse: '#FFC9A8',
  onPrimaryInverse: '#2A1206',
} as const;

const GREEN_INVERSE = {
  surfaceInverse: '#0D2A1E',
  textInverse: '#FFFFFF',
  textInverseMuted: '#B0D4C2',
  surfaceInverseAlt: '#1D4C37',
  borderInverse: '#417F64',
  primaryInverse: '#A9E7C4',
  onPrimaryInverse: '#08251A',
} as const;

/**
 * The original palette, sampled from the reference kit. Its values are
 * unchanged from before the theme picker existed, so an existing install that
 * upgrades sees exactly the screen it had.
 */
const violetLight: Palette = {
  colors: {
    bg: '#F4F4F8',
    surface: '#FFFFFF',
    surfaceAlt: '#EDE6FB',
    border: '#E2DFE9',
    text: '#1B1130',
    textMuted: '#584D75',
    /** The kit's violet, verbatim: measured at 90% of the CTA fill's interior. */
    primary: '#814BE3',
    /** That violet is 4.05:1 on white and fails AA as text, so the text form is
     *  darkened one step while staying the same hue. */
    primaryText: '#6D34D6',
    primaryPressed: '#6229C4',
    primarySoft: '#F4EDFE',
    onFill: '#FFFFFF',
    /** The kit's chart blue #3478F7 is 3.1:1 on white. Darkened until it passes. */
    accent: '#2F5FD0',
    accentSoft: '#E7EEFD',
    /** The kit's amber #F6C855 is a chart fill, far too light to set text in. */
    warn: '#845309',
    warnSoft: '#FCF0D9',
    danger: '#B32F51',
    dangerSoft: '#FDECF0',
    success: '#1E7A4C',
    successSoft: '#E4F3EA',
    overlay: 'rgba(27,17,48,0.45)',
    ...VIOLET_INVERSE,
  },
  tints: [
    { bg: '#DED0FA', fg: '#5B21B6', name: 'lavender' },
    { bg: '#E6F5EE', fg: '#166B48', name: 'mint' },
    { bg: '#FCE9F1', fg: '#9C2A5C', name: 'blush' },
    { bg: '#DCE8FA', fg: '#1F4FA8', name: 'sky' },
  ],
  gradientHero: ['#2E1065', '#3F1C87', '#5320A6'],
  shadowColor: '#1B1130',
  shadowScale: 1,
};

const violetDark: Palette = {
  colors: {
    bg: '#100B1C',
    surface: '#1A1330',
    surfaceAlt: '#251B44',
    border: '#372A5C',
    text: '#F3EFFB',
    textMuted: '#BCB0D8',
    primary: '#C4B0FF',
    primaryText: '#C4B0FF',
    primaryPressed: '#A98CFB',
    primarySoft: '#2A1F4D',
    onFill: '#1A1030',
    accent: '#8FB4FF',
    accentSoft: '#1C2A4A',
    warn: '#F0BE5C',
    warnSoft: '#3A2A0E',
    danger: '#F58BA4',
    dangerSoft: '#3D1622',
    success: '#5DD39E',
    successSoft: '#0F3326',
    overlay: 'rgba(5,3,10,0.65)',
    ...VIOLET_INVERSE,
  },
  tints: [
    { bg: '#2E2154', fg: '#C9B4FF', name: 'lavender' },
    { bg: '#14352A', fg: '#7DE0B0', name: 'mint' },
    { bg: '#3B1A2B', fg: '#FBA5C0', name: 'blush' },
    { bg: '#17294A', fg: '#9FC2FF', name: 'sky' },
  ],
  gradientHero: ['#2E1065', '#3F1C87', '#5320A6'],
  shadowColor: '#000000',
  shadowScale: 1.8,
};

const terracottaLight: Palette = {
  colors: {
    bg: '#FAF5F0',
    surface: '#FFFFFF',
    surfaceAlt: '#F6E7DC',
    border: '#E9DCD1',
    text: '#2A1206',
    textMuted: '#6B4630',
    primary: '#A63D12',
    primaryText: '#93360F',
    primaryPressed: '#87300C',
    primarySoft: '#FBEBE1',
    onFill: '#FFFFFF',
    accent: '#1F6F52',
    accentSoft: '#E2F1EA',
    warn: '#845309',
    warnSoft: '#FCF0D9',
    danger: '#B32F51',
    dangerSoft: '#FDECF0',
    success: '#1E7A4C',
    successSoft: '#E4F3EA',
    overlay: 'rgba(42,18,6,0.45)',
    ...CLAY_INVERSE,
  },
  tints: [
    { bg: '#F8DCC9', fg: '#8A3A11', name: 'clay' },
    { bg: '#E4F1E9', fg: '#166B48', name: 'sage' },
    { bg: '#FBE6D2', fg: '#8A5410', name: 'honey' },
    { bg: '#F6E1DE', fg: '#9E3341', name: 'rosewood' },
  ],
  gradientHero: ['#4A1B08', '#6B2A0D', '#8A3A11'],
  shadowColor: '#2A1206',
  shadowScale: 1,
};

const terracottaDark: Palette = {
  colors: {
    bg: '#17100C',
    surface: '#221812',
    surfaceAlt: '#31231A',
    border: '#463326',
    text: '#FAF0E8',
    textMuted: '#D0B5A2',
    primary: '#FFB088',
    primaryText: '#FFB088',
    primaryPressed: '#F09468',
    primarySoft: '#3A2317',
    onFill: '#2A1206',
    accent: '#7FD9B4',
    accentSoft: '#12332A',
    warn: '#F0BE5C',
    warnSoft: '#3A2A0E',
    danger: '#F58BA4',
    dangerSoft: '#3D1622',
    success: '#5DD39E',
    successSoft: '#0F3326',
    overlay: 'rgba(10,5,2,0.65)',
    ...CLAY_INVERSE,
  },
  tints: [
    { bg: '#432617', fg: '#FFC49E', name: 'clay' },
    { bg: '#16352A', fg: '#84E2B4', name: 'sage' },
    { bg: '#3E2C10', fg: '#F3CE7E', name: 'honey' },
    { bg: '#421D24', fg: '#FBA5B6', name: 'rosewood' },
  ],
  gradientHero: ['#4A1B08', '#6B2A0D', '#8A3A11'],
  shadowColor: '#000000',
  shadowScale: 1.8,
};

const greenLight: Palette = {
  colors: {
    bg: '#F2F6F3',
    surface: '#FFFFFF',
    surfaceAlt: '#E2EFE7',
    border: '#D9E4DD',
    text: '#0F2419',
    textMuted: '#3F5C4D',
    primary: '#136B45',
    primaryText: '#116040',
    primaryPressed: '#0E5537',
    primarySoft: '#E1F2E9',
    onFill: '#FFFFFF',
    accent: '#2F5FD0',
    accentSoft: '#E7EEFD',
    warn: '#845309',
    warnSoft: '#FCF0D9',
    danger: '#B32F51',
    dangerSoft: '#FDECF0',
    success: '#1E7A4C',
    successSoft: '#E4F3EA',
    overlay: 'rgba(15,36,25,0.45)',
    ...GREEN_INVERSE,
  },
  tints: [
    { bg: '#CDE8D8', fg: '#0F5C3C', name: 'herb' },
    { bg: '#E6EFD5', fg: '#4A5F13', name: 'olive' },
    { bg: '#D8E8F6', fg: '#1F4FA8', name: 'water' },
    { bg: '#F6E6D4', fg: '#7A4A12', name: 'wheat' },
  ],
  gradientHero: ['#062B1C', '#0B4830', '#116040'],
  shadowColor: '#0F2419',
  shadowScale: 1,
};

const greenDark: Palette = {
  colors: {
    bg: '#0B140F',
    surface: '#141F18',
    surfaceAlt: '#1E2E24',
    border: '#2C4034',
    text: '#EDF6F0',
    textMuted: '#AFC7B8',
    primary: '#7CE0AC',
    primaryText: '#7CE0AC',
    primaryPressed: '#5FC994',
    primarySoft: '#12301F',
    onFill: '#062B1C',
    accent: '#8FB4FF',
    accentSoft: '#1C2A4A',
    warn: '#F0BE5C',
    warnSoft: '#3A2A0E',
    danger: '#F58BA4',
    dangerSoft: '#3D1622',
    success: '#5DD39E',
    successSoft: '#0F3326',
    overlay: 'rgba(2,8,5,0.65)',
    ...GREEN_INVERSE,
  },
  tints: [
    { bg: '#153726', fg: '#88E5B4', name: 'herb' },
    { bg: '#2B3413', fg: '#CBE07C', name: 'olive' },
    { bg: '#17294A', fg: '#9FC2FF', name: 'water' },
    { bg: '#3B2C15', fg: '#EDC786', name: 'wheat' },
  ],
  gradientHero: ['#062B1C', '#0B4830', '#116040'],
  shadowColor: '#000000',
  shadowScale: 1.8,
};

export const palettes = {
  violet: { light: violetLight, dark: violetDark },
  terracotta: { light: terracottaLight, dark: terracottaDark },
  green: { light: greenLight, dark: greenDark },
} satisfies Record<ThemeFamily, Record<ThemeMode, Palette>>;

export const THEME_FAMILIES: readonly ThemeFamily[] = ['violet', 'terracotta', 'green'];
export const DEFAULT_THEME_FAMILY: ThemeFamily = 'violet';

export function paletteFor(family: ThemeFamily, mode: ThemeMode): Palette {
  return palettes[family]?.[mode] ?? palettes[DEFAULT_THEME_FAMILY][mode];
}

export type ColorToken = keyof PaletteColors;
