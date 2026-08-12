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
const colors = palettes.violet.light.colors;

describe('borderless buttons align to the content margin', () => {
  const source = read('./Button.tsx');

  it('gives ghost variants no horizontal padding', () => {
    // A ghost button paints neither fill nor border, so `paddingHorizontal`
    // only offsets its label from the margin. On the home screen that put
    // "See all" 16pt inside the right edge of every card beneath it.
    expect(source).toMatch(
      /paddingHorizontal:\s*variant === 'ghost' \|\| variant === 'ghostInverse'\s*\?\s*0\s*:\s*spacing\.lg/,
    );
  });

  it('keeps the touch target legal without that padding', () => {
    // Losing the padding narrows an inline ghost button, so the height and the
    // slop are what carry it over 44pt. Both must stay.
    expect(source).toMatch(/minHeight:\s*48/);
    expect(source).toMatch(/hitSlop=\{hitSlop\}/);
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

  it('paints the week progress in the brand colour, not the lone accent blue', () => {
    expect(source).not.toMatch(/backgroundColor:\s*colors\.accent/);
    expect(source).toMatch(/backgroundColor:\s*colors\.primary/);
    // Guards the premise: accent really is a different hue, so painting one
    // bar with it stranded a blue element on an otherwise violet screen.
    expect(colors.accent).not.toBe(colors.primary);
  });

  it('does not mark the quick-add actions with a drill-down chevron', () => {
    // Photo, barcode and receipt open a capture flow; they do not push a
    // detail page. A disclosure indicator on an action row is the iOS
    // convention for "there is more underneath", which there is not.
    expect(source).not.toMatch(/showChevron/);
  });
});
