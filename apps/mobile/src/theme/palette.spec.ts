import { describe, expect, it } from 'vitest';
import { resolveThemeMode, tintIn } from './index';
import { palettes, type Palette, type ThemeFamily, type ThemeMode } from './palettes';
import { contrast } from './contrast';
import {
  RECIPE_THUMB_TONE_FOREGROUNDS,
  RECIPE_THUMB_TONE_TOKENS,
} from '../components/recipe-thumb-tones';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** Every surface a text colour can land on, in whichever mode is under test. */
const SURFACES = ['bg', 'surface', 'surfaceAlt'] as const;

const STATUSES = ['success', 'warn', 'danger'] as const;

// The recipe placeholder picks one of these pairs by hashing the dish key, so
// every pair must be legible — a tone cannot be added without a partner that
// clears the bar.
const RECIPE_THUMB_PAIRS = RECIPE_THUMB_TONE_TOKENS.map(
  (tone) => [RECIPE_THUMB_TONE_FOREGROUNDS[tone], tone] as const,
);

/**
 * Every palette faces the identical bar. The picker lets a user land on any of
 * these six, so "the default one is accessible" is not a claim worth making —
 * asserting the set is the only version of this test that means anything.
 */
const ALL: readonly (readonly [string, Palette])[] = (
  Object.keys(palettes) as ThemeFamily[]
).flatMap((family) =>
  (['light', 'dark'] as ThemeMode[]).map(
    (mode) => [`${family} ${mode}`, palettes[family][mode]] as const,
  ),
);

describe.each(ALL)('%s palette', (_name, palette) => {
  const { colors, tints, gradientHero } = palette;

  it.each(['text', 'textMuted'] as const)('%s reads on every surface', (token) => {
    for (const surface of SURFACES) {
      expect(
        contrast(colors[token], colors[surface]),
        `${token} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('accent reads on every surface', () => {
    for (const surface of SURFACES) {
      expect(
        contrast(colors.accent, colors[surface]),
        `accent on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(RECIPE_THUMB_PAIRS)('placeholder glyph %s reads on %s', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  /**
   * `onFill` rather than `textInverse`, because the two part company in dark
   * mode: a dark-mode fill is light and takes a dark label, while
   * `textInverse` still belongs to the always-dark cook surface.
   */
  it('button fills carry readable labels', () => {
    expect(contrast(colors.onFill, colors.primary), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.onFill, colors.primaryPressed),
      'primary pressed',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.onFill, colors.danger), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * A fill also has to be *seen*, which contrast against its own label cannot
   * tell you. In dark mode this is the live risk: a primary dark enough to
   * carry white text is very nearly the page it sits on.
   */
  it.each(['primary', 'primaryPressed', 'danger'] as const)(
    '%s fill separates from the surface it sits on',
    (fill) => {
      expect(contrast(colors[fill], colors.surface), `${fill} on surface`).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      );
    },
  );

  it.each(STATUSES)('%s reads on its own soft chip', (status) => {
    const soft = `${status}Soft` as const;
    expect(contrast(colors[status], colors[soft]), `${status} on ${soft}`).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it.each(STATUSES)('%s separates as a chip border', (status) => {
    for (const surface of ['bg', 'surface'] as const) {
      expect(
        contrast(colors[status], colors[surface]),
        `${status} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('primaryText reads as text on its own soft chip', () => {
    expect(contrast(colors.primaryText, colors.primarySoft)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * DateField's "clear date" is brand-coloured label text on a card.
   *
   * Only `surface` is certified for it: measured against `surfaceAlt` the same
   * violet is 4.28:1, under AA, so a brand label must never be moved onto the
   * alt surface — use `primarySoft` as its backing instead.
   */
  it('primaryText reads as text on a plain surface', () => {
    expect(contrast(colors.primaryText, colors.surface), 'on surface').toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it('cook mode inverts legibly', () => {
    expect(contrast(colors.textInverse, colors.surfaceInverse), 'primary').toBeGreaterThanOrEqual(
      AA_TEXT,
    );
    expect(
      contrast(colors.textInverseMuted, colors.surfaceInverse),
      'muted',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * Cook mode is the one screen that inverts, and it hosts buttons. A
   * light-mode `primary` is 1.20:1 on `surfaceInverse` — the CTA fill
   * disappears and the ghost label is unreadable. These three pairs are what
   * the `primaryInverse` / `ghostInverse` variants must satisfy. The label is
   * `onPrimaryInverse` and not `text`, because cook mode stays dark even when
   * the app is in dark mode, where `text` is light and would vanish.
   */
  it('cook mode buttons separate from the inverted surface', () => {
    expect(
      contrast(colors.primaryInverse, colors.surfaceInverse),
      'ghostInverse label',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.primaryInverse, colors.surfaceInverse),
      'primaryInverse fill',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.onPrimaryInverse, colors.primaryInverse),
      'primaryInverse label',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * Cook mode also hosts a step badge and a "previous" button, and those had
   * been drawing their fills from the mode-following `warnSoft` / `surfaceAlt`
   * tokens. That is invisible in dark mode, where a "soft" tint is a dark tint
   * and the cook ground is already dark — the pair measured 1.08:1. The fills
   * therefore come from the always-dark group instead. The lift is deliberately
   * gentle, so the border carries the affordance and is held to the full
   * non-text ratio.
   */
  it('cook mode secondary surfaces stay visible against the inverted ground', () => {
    expect(
      contrast(colors.surfaceInverseAlt, colors.surfaceInverse),
      'lifted inverse surface',
    ).toBeGreaterThanOrEqual(1.3);
    expect(
      contrast(colors.borderInverse, colors.surfaceInverse),
      'inverse border',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.textInverse, colors.surfaceInverseAlt),
      'label on lifted inverse surface',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * The tinted cards are the reference's main device, and they are the easiest
   * place for contrast to rot: a designer nudges a fill lighter, the label
   * stays, and the pair silently drops below AA. Each tint therefore ships with
   * its own foreground, and all three text colours that can land on it are
   * asserted.
   */
  describe('card tints', () => {
    it.each(tints)('$name carries its own foreground', (tint) => {
      expect(contrast(tint.fg, tint.bg), `${tint.name} fg`).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it.each(tints)('$name reads with the standard text colours', (tint) => {
      expect(contrast(colors.text, tint.bg), `${tint.name} text`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(colors.textMuted, tint.bg), `${tint.name} muted`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
  });

  /**
   * A gradient is not two colours, it is every colour between them — and the
   * interpolated middle can be lighter than either endpoint. Checking only the
   * declared stops is the trap here, so this samples the ramp densely.
   */
  describe('hero gradient', () => {
    const INVERSE_FOREGROUNDS = [
      ['textInverse', colors.textInverse],
      ['textInverseMuted', colors.textInverseMuted],
      ['primaryInverse', colors.primaryInverse],
    ] as const;

    function sampleRamp(): string[] {
      const toRgb = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
      const stops = gradientHero.map(toRgb);
      const out: string[] = [];
      for (let seg = 0; seg < stops.length - 1; seg += 1) {
        const [a, b] = [stops[seg]!, stops[seg + 1]!];
        for (let step = 0; step <= 40; step += 1) {
          const t = step / 40;
          const mixed = a.map((channel, i) => Math.round(channel + (b[i]! - channel) * t));
          out.push(`#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`);
        }
      }
      return out;
    }

    it.each(INVERSE_FOREGROUNDS)('%s clears AA across the whole ramp', (_token, fg) => {
      for (const stop of sampleRamp()) {
        expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  });

  /**
   * Contrast guards alone cannot catch a tint that has collapsed into the
   * background: a card filled with almost exactly `bg` still passes every text
   * pair, because its foregrounds are unchanged — it simply stops reading as a
   * card. That happened for real when the ground moved to lavender and the
   * lavender tint landed 5.0 away from it.
   *
   * Euclidean RGB distance is a coarse proxy for perceptibility, but it is the
   * right shape of check here: mint, blush and sky separate from the ground by
   * hue rather than lightness, so a luminance-only rule would wrongly demand
   * they get darker.
   */
  describe('tints stay distinguishable from the ground', () => {
    const MIN_DISTANCE = 12;

    function distance(a: string, b: string): number {
      const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const [x, y] = [toRgb(a), toRgb(b)];
      return Math.hypot(...x.map((c, i) => c - y[i]!));
    }

    it.each(tints)('$name is visibly separate from bg', (tint) => {
      expect(distance(tint.bg, colors.bg), `${tint.name} vs bg`).toBeGreaterThanOrEqual(
        MIN_DISTANCE,
      );
    });

    /**
     * The card fill is a surface like any tint, and the one most able to
     * vanish: in light mode `surface` is white, so any move of the ground
     * toward white erases the card without changing a single foreground. The
     * tint loop above cannot see it — `surface` is not a tint — which is
     * exactly how a white-on-white page would have shipped. Web guards the same
     * pair as 'card on page'.
     */
    it.each([
      ['surface', colors.surface],
      ['surfaceAlt', colors.surfaceAlt],
    ] as const)('%s is visibly separate from bg', (_name, value) => {
      expect(distance(value, colors.bg)).toBeGreaterThanOrEqual(MIN_DISTANCE);
    });

    it('rejects a tint that matches the ground', () => {
      expect(distance(colors.bg, colors.bg)).toBe(0);
    });
  });
});

describe('tint rotation', () => {
  const { tints } = palettes.violet.light;

  it('rotates without repeating a neighbour', () => {
    for (let i = 0; i < tints.length * 2; i += 1) {
      expect(tintIn(tints, i).name, `index ${i}`).not.toBe(tintIn(tints, i + 1).name);
    }
  });

  it('wraps negative and fractional indices back into the tuple', () => {
    expect(tintIn(tints, -1).name).toBe(tints[tints.length - 1]!.name);
    expect(tintIn(tints, -tints.length).name).toBe(tints[0]!.name);
    expect(tintIn(tints, 1.7).name).toBe(tints[1]!.name);
  });
});

/**
 * The families must stay recognisably different from one another, or the picker
 * is three ways to choose the same screen. Comparing `primary` is the honest
 * test: it is the colour a user actually points at in the swatch row.
 */
describe('families are distinguishable from each other', () => {
  const MIN_DISTANCE = 60;

  function distance(a: string, b: string): number {
    const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [x, y] = [toRgb(a), toRgb(b)];
    return Math.hypot(...x.map((c, i) => c - y[i]!));
  }

  it.each([
    ['violet', 'terracotta'],
    ['violet', 'green'],
    ['terracotta', 'green'],
  ] as const)('%s and %s do not collide', (a, b) => {
    for (const mode of ['light', 'dark'] as const) {
      expect(
        distance(palettes[a][mode].colors.primary, palettes[b][mode].colors.primary),
        `${a} vs ${b} in ${mode}`,
      ).toBeGreaterThanOrEqual(MIN_DISTANCE);
    }
  });
});

describe('resolving the mode from the preference', () => {
  it('follows the phone when set to automatic', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
  });

  /**
   * `useColorScheme` returns null on the first tick of a cold start. Treating
   * "unknown" as dark would flash a dark screen on every launch on a light
   * phone, so the unknown case has to land on light specifically.
   */
  it('renders light while the phone has not reported its scheme yet', () => {
    expect(resolveThemeMode('system', null)).toBe('light');
    expect(resolveThemeMode('system', undefined)).toBe('light');
  });

  it('ignores the phone when the user has pinned a mode', () => {
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
    expect(resolveThemeMode('light', 'dark')).toBe('light');
  });
});
