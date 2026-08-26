// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { channels, contrast, readTokens, type Theme } from '../lib/contrast';

const CSS = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');

const RECIPE_THUMB_SOURCE = readFileSync(
  fileURLToPath(new URL('../components/ui/RecipeThumb.tsx', import.meta.url)),
  'utf8',
);

/**
 * Read the tone pairs out of the component rather than restating them, so a
 * tone added there is contrast-checked here automatically instead of silently
 * escaping the guard.
 */
const RECIPE_THUMB_TONES: readonly (readonly [string, string])[] = [
  ...RECIPE_THUMB_SOURCE.matchAll(/bg:\s*'bg-([\w-]+)',\s*fg:\s*'text-([\w-]+)'/g),
].map(([, bg, fg]) => [fg, bg] as const);

if (RECIPE_THUMB_TONES.length === 0) {
  throw new Error('No RecipeThumb tone pairs found — the guard would pass vacuously');
}

/** Surfaces a text colour can legitimately land on. Dark has no tint. */
const SURFACES: Record<Theme, readonly string[]> = {
  light: ['canvas', 'canvas-tint', 'background', 'muted'],
  dark: ['canvas', 'background', 'muted'],
};

const STATUSES = ['success', 'warning', 'danger'] as const;

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe.each(['light', 'dark'] as const)('%s palette', (theme) => {
  const tokens = readTokens(CSS, theme);

  const value = (name: string): string => {
    const hex = tokens[name];
    if (!hex) throw new Error(`--${name} is not defined in the ${theme} palette`);
    return hex;
  };

  const ratio = (fg: string, bg: string): number => contrast(value(fg), value(bg));

  it.each(['foreground', 'muted-foreground', 'link'])('--%s reads on every surface', (fg) => {
    for (const bg of SURFACES[theme]) {
      expect(ratio(fg, bg), `--${fg} on --${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('button fills carry readable labels', () => {
    expect(ratio('primary-foreground', 'primary'), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('primary-foreground', 'primary-press'), 'primary pressed').toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('danger-foreground', 'danger'), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('--%s reads on its own soft chip', (status) => {
    expect(ratio(status, `${status}-soft`), `--${status} on --${status}-soft`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUSES)('--%s separates as a chip border', (status) => {
    for (const bg of ['canvas', 'background']) {
      expect(ratio(status, bg), `--${status} border on --${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  // The recipe placeholder picks one of these pairs by hashing the dish key, so
  // every pair must be legible — a tone cannot be added without a partner that
  // clears the bar on both themes.
  it.each(RECIPE_THUMB_TONES)('placeholder glyph %s reads on %s', (fg, bg) => {
    expect(ratio(fg, bg), `--${fg} on --${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('blue-as-text reads wherever it is used', () => {
    for (const bg of ['primary-soft', 'background', 'canvas']) {
      expect(ratio('primary-text', bg), `--primary-text on --${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  /**
   * The accent ships at two weights because the kit's vivid blue #3478f7 is
   * 3.1:1 on white — legible as a large graphic, not as a control or as a
   * word. `--accent` is the fill/icon/focus weight and only has to clear the
   * non-text bar; `--accent-text` carries prose. Guarding both stops the vivid
   * value from creeping back in under either name.
   */
  it('--accent-text reads on every surface it can land on', () => {
    for (const bg of [...SURFACES[theme], 'accent-soft']) {
      expect(ratio('accent-text', bg), `--accent-text on --${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('--accent separates as a control on every surface', () => {
    for (const bg of SURFACES[theme]) {
      expect(ratio('accent', bg), `--accent on --${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  /**
   * The auth hero inverts the screen, so it needs its own foreground pair —
   * `--foreground` on it is 1.15:1 in light mode. Dark mode collapses the band
   * into the canvas, and these two still have to read there.
   */
  it('the inverted hero band carries readable text', () => {
    expect(ratio('inverse-foreground', 'inverse'), 'title').toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('inverse-muted', 'inverse'), 'subtitle').toBeGreaterThanOrEqual(AA_TEXT);
  });
});

/**
 * Contrast cannot see a surface that has collapsed into the one behind it: a
 * chip filled with almost exactly `--canvas` still passes every text pair,
 * because its foregrounds are unchanged — it simply stops reading as a chip.
 * That is not hypothetical; it is how the mobile lavender tint shipped broken.
 *
 * Euclidean RGB distance is a coarse perceptibility proxy, but it is the right
 * shape of check here: these surfaces separate by hue as much as by lightness,
 * so a luminance rule would wrongly demand each one gets darker than the last.
 *
 * Only pairs that actually stack or transition are listed. Dark mode collapses
 * --canvas-tint and --inverse into --canvas on purpose, so neither appears.
 */
describe.each(['light', 'dark'] as const)('%s surfaces stay distinguishable', (theme) => {
  const tokens = readTokens(CSS, theme);
  const MIN_DISTANCE = 12;

  const PAIRS: Record<Theme, readonly (readonly [string, string, string])[]> = {
    light: [
      ['background', 'canvas', 'card on page'],
      ['canvas-tint', 'canvas', 'hero band on page'],
      ['muted', 'canvas', 'chip on page'],
      ['muted', 'background', 'chip on card'],
      ['muted', 'canvas-tint', 'secondary button hover on its rest state'],
      ['muted', 'primary-soft', 'nav hover against nav active'],
    ],
    dark: [
      ['background', 'canvas', 'card on page'],
      ['muted', 'canvas', 'chip on page'],
      ['muted', 'background', 'chip on card'],
      ['muted', 'primary-soft', 'nav hover against nav active'],
    ],
  };

  const distance = (a: string, b: string): number => {
    const [x, y] = [channels(tokens[a]!), channels(tokens[b]!)];
    return Math.hypot(...x.map((c, i) => c - y[i]!));
  };

  it.each(PAIRS[theme])('--%s separates from --%s (%s)', (a, b) => {
    expect(distance(a, b), `--${a} vs --${b}`).toBeGreaterThanOrEqual(MIN_DISTANCE);
  });
});

/**
 * `viewport.themeColor` is serialised into a <meta> tag, so it cannot read a
 * CSS variable and is the one place a palette hex is duplicated. It drifted
 * unnoticed through a previous palette change — the light value named a blue
 * that was not in the palette at all — because nothing compared the two.
 */
describe('browser chrome matches the palette', () => {
  const LAYOUT = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');

  const themeColor = (scheme: Theme): string => {
    const match = new RegExp(`prefers-color-scheme: ${scheme}\\)', color: '(#[0-9a-f]{6})'`).exec(LAYOUT);
    if (!match?.[1]) throw new Error(`no ${scheme} themeColor found in layout.tsx`);
    return match[1];
  };

  it.each(['light', 'dark'] as const)('%s themeColor equals --canvas', (theme) => {
    expect(themeColor(theme)).toBe(readTokens(CSS, theme)['canvas']);
  });
});

describe('contrast harness', () => {
  it('matches the WCAG reference extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 4);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 4);
  });

  it('detects the amber-on-amber warning badge that shipped for months', () => {
    // `Badge tone="warning"` was `bg-accent/20 text-accent` — #e8a33d text on
    // #e8a33d at 20% over white, which composites to #faedd8. It measured
    // 1.87:1 against a 4.5:1 minimum and nothing was watching. Pinned here so
    // the harness itself is proven to catch the class of defect it guards.
    expect(contrast('#e8a33d', '#faedd8')).toBeLessThan(AA_TEXT);
  });
});
