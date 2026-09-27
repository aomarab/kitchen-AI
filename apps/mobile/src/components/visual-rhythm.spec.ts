import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spacing } from '../theme';
import { palettes } from '../theme/palettes';

/**
 * Source-level guards for three layout defects that were measured off a device
 * screenshot rather than guessed at. Mobile tests are node-only — there is no
 * native render harness — so the mechanism is asserted where it is declared,
 * the same way `lib/layout-direction.spec.ts` does.
 */

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');
const colors = palettes.apricot.light.colors;

describe('borderless buttons align to the content margin', () => {
  const source = read('./Button.tsx');

  it('gives the ghost variant no horizontal padding', () => {
    // A ghost button paints neither fill nor border, so `paddingHorizontal`
    // only offsets its label from the margin. On the home screen that put
    // "See all" 16pt inside the right edge of every card beneath it.
    expect(source).toMatch(/paddingHorizontal:\s*variant === 'ghost'\s*\?\s*0\s*:\s*spacing\.lg/);
  });

  it('keeps the touch target legal without that padding', () => {
    // Losing the padding narrows an inline ghost button, so the height and the
    // slop are what carry it over 44pt. Both must stay.
    expect(source).toMatch(/minHeight:\s*48/);
    expect(source).toMatch(/hitSlop=\{hitSlop\}/);
  });
});

describe('pushed-screen header', () => {
  const source = read('./Header.tsx');

  it('centres a bodyStrong title between two equal sides', () => {
    // Spec §8.6. Equal flex on both sides is what keeps the title optically
    // centred when only one side (usually back) is occupied.
    expect(source).toMatch(/variant="bodyStrong"/);
    expect(source).not.toMatch(/variant="title"/);
    expect(source.match(/flex:\s*1\b/g) ?? []).toHaveLength(2);
  });

  it('backs out through a 44pt round button that mirrors in RTL', () => {
    // The old bare 26pt chevron relied on hitSlop for its touch target.
    expect(source).toMatch(/<RoundButton[^>]*icon="back"[^>]*directional/);
  });
});

describe('surfaces', () => {
  it.each(['./Card.tsx', './Tile.tsx'])(
    '%s lifts by shadow in light mode and by its edge in dark mode',
    (file) => {
      // Spec §6.7: a dark page makes any shadow invisible, so depth moves to
      // the border there; in light mode the border matches the fill.
      const source = read(file);
      expect(source).toMatch(/isDark \? colors\.border/);
      expect(source).toMatch(/shadow\.card/);
    },
  );

  it.each(['./Card.tsx', './Tile.tsx'])(
    '%s dims to 0.92 and scales to 0.98 when pressed',
    (file) => {
      const source = read(file);
      expect(source).toMatch(/pressed \? 0\.92/);
      expect(source).toMatch(/scale: pressed \? 0\.98/);
    },
  );

  it('a sheet floats on the raised shadow and closes through a sunk round button', () => {
    const source = read('./Sheet.tsx');
    expect(source).toMatch(/shadow\.raised/);
    expect(source).toMatch(/<RoundButton[^>]*tone="sunk"/);
    expect(source).toMatch(/variant="title"/);
  });
});

describe('screen rhythm', () => {
  const source = read('./Screen.tsx');

  it('separates top-level blocks by more than a section separates its own rows', () => {
    const match = /gap:\s*spacing\.(\w+)\s*\}/.exec(source);
    expect(match, 'Screen must declare a padded-container gap').not.toBeNull();
    const token = match![1] as keyof typeof spacing;
    expect(spacing[token]).toBeGreaterThanOrEqual(spacing.sm * 2);
  });
});

describe('home screen palette', () => {
  const source = read('../app/(tabs)/home.tsx');

  it('paints the sage plan tile progress in the brand colour, not the herb accent', () => {
    expect(source).not.toMatch(/backgroundColor:\s*colors\.accent/);
    expect(source).toMatch(/backgroundColor:\s*colors\.primary/);
    // Guards the premise: accent really is a different hue, so painting this
    // progress bar with it would strand one herb-green metric on a coral screen.
    expect(colors.accent).not.toBe(colors.primary);
  });

  it('does not mark the Home action tiles with a drill-down chevron', () => {
    // Scan receipt and plan week are actions, not detail pages. A disclosure
    // indicator says "there is more underneath", which there is not.
    expect(source).not.toMatch(/showChevron/);
  });
});

describe('G1 primitive extensions', () => {
  it('lets Tile replace the icon with a leading slot, fall back to ember and expose actions', () => {
    const source = read('./Tile.tsx');
    expect(source).toContain('leading?: ReactNode');
    expect(source).toContain('accessibilityActions');
    expect(source).toContain('onAccessibilityAction');
    expect(source).toContain('photo && !image');
    expect(source).toContain('gradientHero');
  });

  it('renders TabHeader accent text as primaryText in the same display line', () => {
    const source = read('./TabHeader.tsx');
    expect(source).toContain('titleAccent?: string');
    expect(source).toContain('color="primaryText"');
    expect(source).toContain('variant="display"');
  });

  it('keeps a 48pt RoundButton target for the Tonight play control', () => {
    const source = read('./RoundButton.tsx');
    expect(source).toContain('36 | 40 | 44 | 48');
    expect(source).toContain('const targetSize = size === 48 ? 48 : 44');
    expect(source).toContain('size === 48 ? { width: targetSize, height: targetSize } : null');
  });
});
