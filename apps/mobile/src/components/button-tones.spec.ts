import { describe, expect, it } from 'vitest';
import { BUTTON_VARIANTS, ICON_BUTTON_TONES, buttonTone, iconButtonTone } from './button-tones';
import { palettes, type ThemeMode } from '../theme/palettes';
import { contrast } from '../theme/contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe.each(['light', 'dark'] as ThemeMode[])('button tones, coral %s', (mode) => {
  const { colors } = palettes.coral[mode];

  it('offers exactly the Coral variants', () => {
    expect([...BUTTON_VARIANTS].sort()).toEqual(
      ['destructive', 'ghost', 'inverse', 'primary', 'secondary'].sort(),
    );
  });

  it.each(BUTTON_VARIANTS.filter((variant) => variant !== 'ghost'))(
    '%s carries a readable label on its fill, pressed or not',
    (variant) => {
      const tone = buttonTone(colors, variant);
      const ground = tone.fill === 'transparent' ? colors.bg : tone.fill;
      expect(contrast(tone.label, ground), `${variant} label`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrast(tone.label, tone.pressedFill === 'transparent' ? colors.bg : tone.pressedFill),
        `${variant} label, pressed`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it('ghost labels read on the page and on a card', () => {
    const { label } = buttonTone(colors, 'ghost');
    expect(contrast(label, colors.bg), 'ghost on bg').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(label, colors.surface), 'ghost on surface').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('danger-toned ghosts use the danger text token without a fill', () => {
    const tone = buttonTone(colors, 'ghost', { tone: 'danger' });
    expect(tone.fill).toBe('transparent');
    expect(tone.border).toBe('transparent');
    expect(tone.label).toBe(colors.danger);
    expect(contrast(tone.label, colors.bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('labels the coral and destructive fills with their own readable tokens', () => {
    expect(buttonTone(colors, 'primary').label).toBe(colors.onFill);
    expect(buttonTone(colors, 'destructive').label).toBe(colors.onDanger);
  });

  it('paints disabled buttons as a tokenised disabled state, not opacity-only', () => {
    const tone = buttonTone(colors, 'primary', { disabled: true });
    expect(tone).toMatchObject({
      fill: colors.surfaceAlt,
      pressedFill: colors.surfaceAlt,
      label: colors.textMuted,
      border: colors.surfaceAlt,
    });
    expect(contrast(tone.label, tone.fill), 'disabled label').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(ICON_BUTTON_TONES)('%s icon buttons carry a readable glyph', (name) => {
    const tone = iconButtonTone(colors, name);
    const ground =
      tone.fill === 'transparent'
        ? colors.bg
        : tone.fill.startsWith('rgba')
          ? colors.surfaceInverse
          : tone.fill;
    expect(contrast(tone.glyph, ground), name).toBeGreaterThanOrEqual(AA_NON_TEXT);
    if (tone.border !== 'transparent' && name !== 'outline') {
      expect(contrast(tone.border, colors.bg), `${name} edge`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('uses the hairline border token for outline icon buttons', () => {
    expect(iconButtonTone(colors, 'outline').border).toBe(colors.border);
  });

  it('uses the media overlay token for media icon buttons', () => {
    expect(iconButtonTone(colors, 'media').fill).toBe(colors.mediaButton);
    expect(iconButtonTone(colors, 'media').glyph).toBe(colors.textInverse);
  });
});
