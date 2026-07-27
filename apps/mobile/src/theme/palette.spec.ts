import { describe, expect, it } from 'vitest';
import { colors } from './index';
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
});
