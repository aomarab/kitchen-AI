import { describe, expect, it } from 'vitest';
import { BUTTON_VARIANTS, buttonTone } from './button-tones';
import { palettes, type ThemeMode } from '../theme/palettes';
import { contrast } from '../theme/contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe.each(['light', 'dark'] as ThemeMode[])('button tones, apricot %s', (mode) => {
  const { colors } = palettes.apricot[mode];

  it('offers exactly the Apricot variants', () => {
    // The three *Inverse variants are gone for good: cook mode follows the
    // theme, and anything on a photo or the camera uses `media`.
    expect([...BUTTON_VARIANTS].sort()).toEqual(
      ['danger', 'ghost', 'media', 'primary', 'secondary', 'soft'].sort(),
    );
  });

  it.each(BUTTON_VARIANTS.filter((variant) => variant !== 'ghost'))(
    '%s carries a readable label on its fill, pressed or not',
    (variant) => {
      const tone = buttonTone(colors, variant);
      expect(contrast(tone.label, tone.fill), `${variant} label`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrast(tone.label, tone.pressedFill),
        `${variant} label, pressed`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it('ghost labels read on the page and on a card', () => {
    const { label } = buttonTone(colors, 'ghost');
    expect(contrast(label, colors.bg), 'ghost on bg').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(label, colors.surface), 'ghost on surface').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('media buttons separate from the dark surface they sit on', () => {
    const { fill } = buttonTone(colors, 'media');
    expect(contrast(fill, colors.surfaceInverse)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('labels the coral in ink and the light red in its own token', () => {
    // A reviewer's shorthand for spec §3: coral is never white-labelled.
    expect(buttonTone(colors, 'primary').label).toBe(colors.onFill);
    expect(buttonTone(colors, 'danger').label).toBe(colors.onDanger);
  });
});
