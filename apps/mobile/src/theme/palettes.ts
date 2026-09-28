/**
 * Apricot: the app's one palette, in a light and a dark mode (mobile redesign
 * spec §6). Every value here is verified by `palette.spec.ts`.
 *
 * - `primary` is the coral *fill*; `primaryText` is the same hue darkened
 *   until it passes as *text*. The coral is bright, so the label on it is ink
 *   (`onFill`) in both modes — never white, which measures under 3:1.
 * - `onFill` labels `primary` and `primaryPressed` only. The destructive fill
 *   takes its own label, `onDanger`, because a light-mode red wants white and
 *   the dark-mode one wants ink.
 *
 * The `*Inverse` group is the *media* surface: the camera viewfinder, a photo,
 * the live assistant's camera and the video player. Those are dark whatever
 * the mode, so the group is one shared object, identical in light and dark.
 */

export type TintName = 'plain' | 'butter' | 'sage' | 'apricot';

export interface Tint {
  readonly bg: string;
  readonly fg: string;
  readonly name: TintName;
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
  readonly onDanger: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly warn: string;
  /** Media-safe warning dot for inverse chips where dark-mode `warn` is too light. */
  readonly warnInverse: string;
  readonly warnSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly success: string;
  readonly successSoft: string;
  readonly surfaceInverse: string;
  /** Lifted fill on a media surface (badges, secondary controls). */
  readonly surfaceInverseAlt: string;
  /** Outline on a media surface. */
  readonly borderInverse: string;
  readonly textInverse: string;
  readonly textInverseMuted: string;
  readonly primaryInverse: string;
  readonly onPrimaryInverse: string;
  readonly overlay: string;
}

/**
 * The bottom gradient that lets text sit on a photo. `stops` are
 * `[position from the top, alpha]`, linear between them; text may only sit
 * where alpha is at least `textMinAlpha`.
 */
export interface Scrim {
  readonly rgb: string;
  readonly stops: readonly (readonly [number, number])[];
  readonly textMinAlpha: number;
}

export interface Palette {
  readonly colors: PaletteColors;
  readonly tints: readonly Tint[];
  readonly gradientHero: readonly string[];
  readonly scrim: Scrim;
  /** Dark pages get a black shadow that no one can see, so depth moves onto
   *  the border instead and the shadow is dialled back to a faint halo. */
  readonly shadowColor: string;
  readonly shadowScale: number;
}

export type ThemeMode = 'light' | 'dark';

/** Constant across light and dark: media surfaces are always dark. */
const MEDIA = {
  surfaceInverse: '#1A120E',
  surfaceInverseAlt: '#3A2B22',
  borderInverse: '#8A7263',
  textInverse: '#FFFFFF',
  textInverseMuted: '#D9C8BC',
  primaryInverse: '#FFB08F',
  onPrimaryInverse: '#2A1A12',
} as const;

/** The "ember" ramp behind a Tonight tile that has no photo. */
const EMBER = ['#2A1A12', '#4A2516', '#6A3019'] as const;

/**
 * A single linear ramp from 0 at 40% to 0.82 at the bottom would only clear
 * 0.70 in the bottom 9% of a tile — too thin for a title and a caption. The
 * knee at 60% gives text the bottom 40%.
 */
const SCRIM: Scrim = {
  rgb: '#1A120E',
  stops: [
    [0, 0],
    [0.35, 0],
    [0.6, 0.7],
    [1, 0.82],
  ],
  textMinAlpha: 0.7,
};

const apricotLight: Palette = {
  colors: {
    bg: '#F7F3EF',
    surface: '#FFFFFF',
    surfaceAlt: '#F1EAE4',
    border: '#E6DCD3',
    text: '#2A1A12',
    /** The mock's #8A7A70 is 4.12:1 on the page and fails AA; this is the step that passes. */
    textMuted: '#6F6056',
    /** The mock's #FF6B3D is 2.83:1 on white and fails even the 3:1 fill bar. */
    primary: '#F05A2B',
    primaryPressed: '#E95424',
    primaryText: '#B83D0C',
    primarySoft: '#FFE9E0',
    onFill: '#2A1A12',
    onDanger: '#FFFFFF',
    accent: '#3F6A36',
    accentSoft: '#E3EDDD',
    success: '#1C7443',
    successSoft: '#E4F2E9',
    warn: '#9A5B00',
    warnInverse: '#A56300',
    warnSoft: '#F8ECDA',
    danger: '#C0341D',
    dangerSoft: '#FBE5E1',
    overlay: 'rgba(42,26,18,0.45)',
    ...MEDIA,
  },
  tints: [
    { bg: '#FFFFFF', fg: '#B83D0C', name: 'plain' },
    { bg: '#FFF1C9', fg: '#7A5200', name: 'butter' },
    { bg: '#E3EDDD', fg: '#3F6A36', name: 'sage' },
    { bg: '#FFE9E0', fg: '#B83D0C', name: 'apricot' },
  ],
  gradientHero: EMBER,
  scrim: SCRIM,
  shadowColor: '#2A1A12',
  shadowScale: 1,
};

/** Warm, never neutral grey: a roasted-cocoa page, with the mock's coral kept. */
const apricotDark: Palette = {
  colors: {
    bg: '#16100C',
    surface: '#221913',
    surfaceAlt: '#2D231C',
    border: '#3D3027',
    text: '#F7EEE8',
    textMuted: '#BFAFA4',
    primary: '#FF6B3D',
    primaryPressed: '#FF8660',
    primaryText: '#FF9A73',
    primarySoft: '#3B2218',
    onFill: '#2A1A12',
    onDanger: '#2A1A12',
    accent: '#A3CF95',
    accentSoft: '#1F2B1B',
    success: '#44A36A',
    successSoft: '#15291D',
    warn: '#F2B45E',
    warnInverse: '#A56300',
    warnSoft: '#35260F',
    danger: '#FF8A78',
    dangerSoft: '#3D1C16',
    overlay: 'rgba(0,0,0,0.6)',
    ...MEDIA,
  },
  tints: [
    { bg: '#221913', fg: '#FF9A73', name: 'plain' },
    { bg: '#342A12', fg: '#F2CD6E', name: 'butter' },
    { bg: '#1F2B1B', fg: '#A8D39A', name: 'sage' },
    { bg: '#3B2218', fg: '#FF9A73', name: 'apricot' },
  ],
  gradientHero: EMBER,
  scrim: SCRIM,
  shadowColor: '#000000',
  shadowScale: 1.8,
};

export const palettes = {
  apricot: { light: apricotLight, dark: apricotDark },
} satisfies Record<string, Record<ThemeMode, Palette>>;

export function paletteFor(mode: ThemeMode): Palette {
  return palettes.apricot[mode] ?? palettes.apricot.light;
}

export type ColorToken = keyof PaletteColors;
