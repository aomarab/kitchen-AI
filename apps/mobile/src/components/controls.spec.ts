import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chipTone, countBadgeTone, segmentTone, segmentTrack, stepperTone } from './control-tones';
import { hitSlop } from '../theme';
import { palettes, type ThemeMode } from '../theme/palettes';
import { contrast } from '../theme/contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');

describe.each(['light', 'dark'] as ThemeMode[])('control tones, coral %s', (mode) => {
  const { colors } = palettes.coral[mode];

  it('chip labels read selected or not, and on a tag', () => {
    for (const selected of [false, true]) {
      const tone = chipTone(colors, 'pill', selected);
      expect(contrast(tone.label, tone.fill), `selected ${selected}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
    const tag = chipTone(colors, 'tag', false);
    expect(contrast(tag.label, tag.fill), 'tag').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('a selected chip inverts to the text colour (spec §8.4)', () => {
    expect(chipTone(colors, 'pill', true)).toMatchObject({ fill: colors.text, label: colors.bg });
  });

  it('an unselected chip keeps an edge, because a white pill on a white card has no other', () => {
    const tone = chipTone(colors, 'pill', false);
    expect(tone.fill).toBe(colors.surface);
    expect(tone.border).not.toBe(tone.fill);
  });

  it('a primary chip uses the brand fill with its ink label', () => {
    const tone = chipTone(colors, 'pill', false, 'primary');
    expect(tone.fill).toBe(colors.primary);
    expect(tone.label).toBe(colors.onFill);
    expect(contrast(tone.label, tone.fill)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('a count badge reads', () => {
    const tone = countBadgeTone(colors);
    expect(contrast(tone.label, tone.fill)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('stepper glyphs separate from their circles, and + is the brand action', () => {
    for (const action of ['decrement', 'increment'] as const) {
      const tone = stepperTone(colors, action);
      expect(contrast(tone.glyph, tone.fill), action).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
    expect(stepperTone(colors, 'increment').fill).toBe(colors.primary);
    expect(stepperTone(colors, 'decrement').fill).toBe(colors.surfaceAlt);
  });

  it('segment labels read on the thumb and on the bare track', () => {
    const on = segmentTone(colors, true);
    expect(contrast(on.label, on.fill), 'selected').toBeGreaterThanOrEqual(AA_TEXT);
    // An unselected segment paints nothing, so its label sits on the track.
    const off = segmentTone(colors, false);
    expect(contrast(off.label, segmentTrack(colors)), 'unselected').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('media segments use inverse camera-surface tokens', () => {
    expect(segmentTrack(colors, 'media')).toBe(colors.surfaceInverseAlt);

    const selected = segmentTone(colors, true, mode === 'dark', 'media');
    expect(selected).toMatchObject({
      fill: colors.textInverse,
      label: colors.onPrimaryInverse,
      border: colors.textInverse,
    });
    expect(contrast(selected.label, selected.fill), 'media selected').toBeGreaterThanOrEqual(
      AA_TEXT,
    );

    const unselected = segmentTone(colors, false, mode === 'dark', 'media');
    expect(unselected.label).toBe(colors.textInverseMuted);
    expect(
      contrast(unselected.label, segmentTrack(colors, 'media')),
      'media unselected',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('control touch targets', () => {
  it('a chip reaches 44pt through the theme slop', () => {
    const source = read('./Chip.tsx');
    const match = /minHeight:\s*(\d+)/.exec(source);
    expect(match, 'Chip must declare its visual height').not.toBeNull();
    const height = Number(match![1]);
    expect(height).toBe(32);
    expect(source).toMatch(/hitSlop=\{hitSlop\}/);
    expect(height + 2 * hitSlop).toBeGreaterThanOrEqual(44);
  });

  it('the stepper is one adjustable element with increment and decrement actions', () => {
    const source = read('./QuantityStepper.tsx');
    expect(source).toContain("accessibilityRole={accessible ? 'adjustable' : undefined}");
    expect(source).toMatch(/name: 'increment'/);
    expect(source).toMatch(/name: 'decrement'/);
    expect(source).toContain('accessible={false}');
    expect(source).toContain('importantForAccessibility="no"');
  });

  it('segments extend their slop to the edge of the 44pt track', () => {
    // The track's inset and each segment's slop are the same token, so a tap
    // anywhere on the track lands on a segment.
    const source = read('./SegmentedControl.tsx');
    expect(source).toMatch(/padding:\s*spacing\.xs/);
    expect(source).toMatch(/hitSlop=\{spacing\.xs\}/);
  });
});
