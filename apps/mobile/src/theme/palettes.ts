/**
 * Coral: the app's one palette, in a light and a dark mode (mobile Coral
 * redesign spec §5). Every value here is verified by `palette.spec.ts`.
 *
 * - `primary` is the coral fill; `primaryText` is the same hue darkened until
 *   it passes as text on white, `surfaceAlt` and `primarySoft`.
 * - The `*Inverse` group is the media surface: camera, photos, video and the
 *   live assistant. It is shared by light and dark modes.
 */

export interface PaletteColors {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly rowline: string;
  readonly cardEdge: string;
  readonly text: string;
  readonly textMuted: string;
  readonly control: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly primaryPressed: string;
  readonly primaryArt: string;
  readonly primarySoft: string;
  readonly onFill: string;
  readonly onDanger: string;
  readonly onSuccess: string;
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
  readonly mediaButton: string;
  readonly inverse: string;
  readonly onInverse: string;
  readonly onInverseMuted: string;
  readonly primaryOnInverse: string;
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
  readonly scrim: Scrim;
  readonly shadowColor: string;
  readonly shadowScale: number;
}

export type ThemeMode = 'light' | 'dark';

/** Native iOS switch thumb colour, used only for contrast maths in palette tests. */
export const NATIVE_SWITCH_THUMB = '#FFFFFF';

/** Constant across light and dark: media surfaces are always dark. */
const MEDIA = {
  surfaceInverse: '#111111',
  surfaceInverseAlt: '#2A2A2D',
  borderInverse: '#8A8A8F',
  textInverse: '#FFFFFF',
  textInverseMuted: '#B4B4B9',
  primaryInverse: '#FF8A8F',
  onPrimaryInverse: '#111111',
  warnInverse: '#A56300',
  mediaButton: 'rgba(0,0,0,0.45)',
} as const;

const SCRIM: Scrim = {
  rgb: '#000000',
  stops: [
    [0, 0],
    [0.35, 0],
    [0.6, 0.7],
    [1, 0.82],
  ],
  textMinAlpha: 0.7,
};

const coralLightColors: PaletteColors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F5',
  border: '#E5E5E7',
  rowline: '#EFEFF1',
  cardEdge: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#6B6B70',
  control: '#8A8A8F',
  primary: '#DC343C',
  primaryPressed: '#C22A32',
  primaryText: '#CC2E36',
  primaryArt: '#F5424B',
  primarySoft: '#FDECEC',
  onFill: '#FFFFFF',
  onDanger: '#FFFFFF',
  onSuccess: '#FFFFFF',
  success: '#1A7F37',
  successSoft: '#EAF5EC',
  warn: '#9A5B00',
  warnSoft: '#FBF1E0',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  onInverse: '#FFFFFF',
  inverse: '#1A1A1A',
  onInverseMuted: '#B4B4B9',
  primaryOnInverse: '#FF8A8F',
  overlay: 'rgba(0,0,0,0.4)',
  ...MEDIA,
};

const coralDarkColors: PaletteColors = {
  bg: '#0F0F10',
  surface: '#18181A',
  surfaceAlt: '#1E1E20',
  border: '#2C2C2F',
  rowline: '#232326',
  cardEdge: '#2C2C2F',
  text: '#F4F4F5',
  textMuted: '#A1A1A6',
  control: '#7C7C82',
  primary: '#DC343C',
  primaryPressed: '#C22A32',
  primaryText: '#FF6B70',
  primaryArt: '#FF6B70',
  primarySoft: '#2A1415',
  onFill: '#FFFFFF',
  onDanger: '#111111',
  onSuccess: '#111111',
  success: '#4CC76A',
  successSoft: '#13261A',
  warn: '#E0A040',
  warnSoft: '#2B2110',
  danger: '#FF8A80',
  dangerSoft: '#2E1715',
  onInverse: '#111111',
  inverse: '#F4F4F5',
  onInverseMuted: '#55555A',
  primaryOnInverse: '#C22A32',
  overlay: 'rgba(0,0,0,0.6)',
  ...MEDIA,
};

const coralLight: Palette = {
  colors: coralLightColors,
  scrim: SCRIM,
  shadowColor: '#1A1A1A',
  shadowScale: 1,
};

const coralDark: Palette = {
  colors: coralDarkColors,
  scrim: SCRIM,
  shadowColor: '#000000',
  shadowScale: 0,
};

export const palettes = {
  coral: { light: coralLight, dark: coralDark },
} satisfies Record<string, Record<ThemeMode, Palette>>;

export function paletteFor(mode: ThemeMode): Palette {
  return palettes.coral[mode] ?? palettes.coral.light;
}

export type ColorToken = keyof PaletteColors;
