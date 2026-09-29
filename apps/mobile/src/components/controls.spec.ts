import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkboxTone,
  chipTone,
  countBadgeTone,
  segmentTone,
  segmentTrack,
  starTone,
  stepperTone,
  toggleTone,
} from './control-tones';
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

  it('a selected chip uses the Coral action fill with no border', () => {
    expect(chipTone(colors, 'pill', true)).toMatchObject({
      fill: colors.primary,
      label: colors.onFill,
      border: 'transparent',
    });
  });

  it('an unselected chip is white with the J hairline border token', () => {
    const tone = chipTone(colors, 'pill', false);
    expect(tone.fill).toBe(colors.bg);
    expect(tone.border).toBe(colors.border);
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

  it('stepper glyphs read inside the single bordered visual box', () => {
    for (const action of ['decrement', 'increment'] as const) {
      const tone = stepperTone(colors, action);
      expect(tone.fill).toBe('transparent');
      expect(contrast(tone.glyph, colors.bg), action).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('segment labels read on the selected block and on the bare track', () => {
    const on = segmentTone(colors, true);
    expect(on.fill).toBe(colors.inverse);
    expect(on.label).toBe(colors.onInverse);
    expect(contrast(on.label, on.fill), 'selected').toBeGreaterThanOrEqual(AA_TEXT);
    const off = segmentTone(colors, false);
    expect(contrast(off.label, segmentTrack(colors)), 'unselected').toBeGreaterThanOrEqual(AA_TEXT);
    expect(segmentTrack(colors)).toBe(colors.bg);
  });

  it('media segments use inverse camera-surface tokens', () => {
    expect(segmentTrack(colors, 'media')).toBe(colors.surfaceInverseAlt);

    const selected = segmentTone(colors, true, mode === 'dark', 'media');
    expect(selected).toMatchObject({
      fill: colors.textInverse,
      label: colors.surfaceInverse,
      border: colors.textInverse,
    });
    expect(contrast(selected.label, selected.fill), 'media selected').toBeGreaterThanOrEqual(
      AA_TEXT,
    );

    const unselected = segmentTone(colors, false, mode === 'dark', 'media');
    expect(unselected.label).toBe(colors.textInverse);
    expect(
      contrast(unselected.label, segmentTrack(colors, 'media')),
      'media unselected',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('checkbox tones meet the square Coral contract', () => {
    const off = checkboxTone(colors, false);
    expect(off).toMatchObject({ fill: colors.bg, border: colors.control, glyph: 'transparent' });
    expect(contrast(off.border, off.fill), 'off outline').toBeGreaterThanOrEqual(AA_NON_TEXT);

    const on = checkboxTone(colors, true);
    expect(on).toMatchObject({
      fill: colors.primary,
      border: colors.primary,
      glyph: colors.onFill,
    });
    expect(contrast(on.glyph, on.fill), 'on check').toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('toggle tones use the square control track and Coral on-state', () => {
    const off = toggleTone(colors, false);
    expect(off).toMatchObject({ track: colors.control, knob: colors.onFill });
    expect(contrast(off.knob, off.track), 'off knob').toBeGreaterThanOrEqual(AA_NON_TEXT);

    const on = toggleTone(colors, true);
    expect(on).toMatchObject({ track: colors.primary, knob: colors.onFill });
    expect(contrast(on.knob, on.track), 'on knob').toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('star tones use filled Coral and empty control strokes', () => {
    expect(starTone(colors, true)).toMatchObject({
      glyph: colors.primary,
      icon: 'star',
      filled: true,
    });
    expect(starTone(colors, false)).toMatchObject({
      glyph: colors.control,
      icon: 'star',
      filled: false,
    });
    expect(contrast(starTone(colors, false).glyph, colors.bg), 'empty star').toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it('StarRating passes the explicit fill state to the glyph, not an alias', () => {
    const source = read('./StarRating.tsx');

    expect(source).toContain(
      '<Icon name={tone.icon} size={20} color={tone.glyph} filled={tone.filled} />',
    );
    expect(source).not.toContain('starOutline');
  });
});

describe('control touch targets', () => {
  it('a chip reaches 44pt through the theme slop', () => {
    const source = read('./Chip.tsx');
    const match = /minHeight:\s*(\d+)/.exec(source);
    expect(match, 'Chip must declare its visual height').not.toBeNull();
    const height = Number(match![1]);
    expect(height).toBe(36);
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
    expect(source).toContain('STEPPER_VISUAL_WIDTH = 118');
    expect(source).toContain('STEPPER_VISUAL_HEIGHT = 36');
  });

  it('segments are a 44pt bordered track and cross-fade selection with Reduce Motion support', () => {
    const source = read('./SegmentedControl.tsx');
    expect(source).toMatch(/minHeight:\s*44/);
    expect(source).toMatch(/borderWidth:\s*1/);
    expect(source).toContain("tone === 'media' ? colors.borderInverse : colors.border");
    expect(source).toContain('useReduceMotion()');
    expect(source).toContain('duration: reduceMotion ? 0 : 120');
  });

  it('chips and steppers use the J border token for hairlines', () => {
    const chipToneSource = read('./control-tones.ts');
    expect(chipToneSource).toContain('border: colors.border');

    const stepper = read('./QuantityStepper.tsx');
    expect(stepper).toContain('borderColor: colors.border');
    expect(stepper).not.toContain('borderColor: colors.control');
  });

  it('new square controls expose roles and 44pt pressable targets', () => {
    const checkbox = read('./Checkbox.tsx');
    expect(checkbox).toContain('accessibilityRole="checkbox"');
    expect(checkbox).toMatch(/CHECKBOX_TARGET_SIZE = 44/);
    expect(checkbox).toContain('width: CHECKBOX_TARGET_SIZE');
    expect(checkbox).toContain('height: CHECKBOX_TARGET_SIZE');
    expect(checkbox).toMatch(/CHECKBOX_VISUAL_SIZE = 22/);
    expect(checkbox).toContain('width: CHECKBOX_VISUAL_SIZE');
    expect(checkbox).toContain('height: CHECKBOX_VISUAL_SIZE');

    const toggle = read('./Toggle.tsx');
    expect(toggle).toContain('accessibilityRole="switch"');
    expect(toggle).toMatch(/TOGGLE_TARGET_SIZE = 44/);
    expect(toggle).toContain('height: TOGGLE_TARGET_SIZE');
    expect(toggle).toMatch(/TRACK_WIDTH = 44/);
    expect(toggle).toMatch(/TRACK_HEIGHT = 26/);
    expect(toggle).toContain('duration: reduceMotion ? 0 : 160');
  });
});
