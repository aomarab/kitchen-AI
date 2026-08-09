// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast, readTokens, type Theme } from '../lib/contrast';

const CSS = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');

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

  it('blue-as-text reads wherever it is used', () => {
    for (const bg of ['primary-soft', 'background', 'canvas']) {
      expect(ratio('primary-text', bg), `--primary-text on --${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  /**
   * The auth hero inverts the screen, so it needs its own foreground pair —
   * `--foreground` on it is 1.12:1 in light mode. Dark mode collapses the band
   * into the canvas, and these two still have to read there.
   */
  it('the inverted hero band carries readable text', () => {
    expect(ratio('inverse-foreground', 'inverse'), 'title').toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('inverse-muted', 'inverse'), 'subtitle').toBeGreaterThanOrEqual(AA_TEXT);
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
