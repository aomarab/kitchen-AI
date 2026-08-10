import { describe, expect, it } from 'vitest';
import { colors, gradientHero, tintFor, tints } from './index';
import { contrast } from './contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** Every surface a text colour can land on. Mobile has no dark theme. */
const SURFACES = ['bg', 'surface', 'surfaceAlt'] as const;

const STATUSES = ['success', 'warn', 'danger'] as const;

describe('mobile palette', () => {
  it.each(['text', 'textMuted'] as const)('%s reads on every surface', (token) => {
    for (const surface of SURFACES) {
      expect(contrast(colors[token], colors[surface]), `${token} on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('accent reads on every surface', () => {
    for (const surface of SURFACES) {
      expect(contrast(colors.accent, colors[surface]), `accent on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('button fills carry readable labels', () => {
    expect(contrast(colors.textInverse, colors.primary), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.textInverse, colors.primaryPressed), 'primary pressed').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.textInverse, colors.danger), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('%s reads on its own soft chip', (status) => {
    const soft = `${status}Soft` as const;
    expect(contrast(colors[status], colors[soft]), `${status} on ${soft}`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('%s separates as a chip border', (status) => {
    for (const surface of ['bg', 'surface'] as const) {
      expect(contrast(colors[status], colors[surface]), `${status} on ${surface}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('primary reads as text on its own soft chip', () => {
    expect(contrast(colors.primary, colors.primarySoft)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('cook mode inverts legibly', () => {
    expect(contrast(colors.textInverse, colors.surfaceInverse), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.textInverseMuted, colors.surfaceInverse), 'muted').toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * Cook mode is the one screen that inverts, and it hosts buttons. The
   * light-mode `primary` is 1.20:1 on `surfaceInverse` — the CTA fill
   * disappears and the ghost label is unreadable. These three pairs are what
   * the `primaryInverse` / `ghostInverse` variants must satisfy.
   */
  it('cook mode buttons separate from the inverted surface', () => {
    expect(contrast(colors.primaryInverse, colors.surfaceInverse), 'ghostInverse label').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.primaryInverse, colors.surfaceInverse), 'primaryInverse fill').toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrast(colors.text, colors.primaryInverse), 'primaryInverse label').toBeGreaterThanOrEqual(AA_TEXT);
  });
});

/**
 * The tinted cards are the reference's main device, and they are the easiest
 * place for contrast to rot: a designer nudges a fill lighter, the label stays,
 * and the pair silently drops below AA. Each tint therefore ships with its own
 * foreground, and all three text colours that can land on it are asserted.
 */
describe('card tints', () => {
  it.each(tints)('$name carries its own foreground', (tint) => {
    expect(contrast(tint.fg, tint.bg), `${tint.name} fg`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(tints)('$name reads with the standard text colours', (tint) => {
    expect(contrast(colors.text, tint.bg), `${tint.name} text`).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.textMuted, tint.bg), `${tint.name} muted`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('rotates without repeating a neighbour', () => {
    for (let i = 0; i < tints.length * 2; i += 1) {
      expect(tintFor(i).name, `index ${i}`).not.toBe(tintFor(i + 1).name);
    }
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

  it.each(INVERSE_FOREGROUNDS)('%s clears AA across the whole ramp', (_name, fg) => {
    for (const stop of sampleRamp()) {
      expect(contrast(fg, stop), `${fg} on ${stop}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('tintFor wrapping', () => {
  it('wraps negative and fractional indices back into the tuple', () => {
    expect(tintFor(-1).name).toBe(tints[tints.length - 1]!.name);
    expect(tintFor(-tints.length).name).toBe(tints[0].name);
    expect(tintFor(1.7).name).toBe(tints[1]!.name);
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
 * hue rather than lightness, so a luminance-only rule would wrongly demand they
 * get darker.
 */
describe('tints stay distinguishable from the ground', () => {
  const MIN_DISTANCE = 12;

  function distance(a: string, b: string): number {
    const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [x, y] = [toRgb(a), toRgb(b)];
    return Math.hypot(...x.map((c, i) => c - y[i]!));
  }

  it.each(tints)('$name is visibly separate from bg', (tint) => {
    expect(distance(tint.bg, colors.bg), `${tint.name} vs bg`).toBeGreaterThanOrEqual(MIN_DISTANCE);
  });

  it('rejects a tint that matches the ground', () => {
    expect(distance(colors.bg, colors.bg)).toBe(0);
  });
});
