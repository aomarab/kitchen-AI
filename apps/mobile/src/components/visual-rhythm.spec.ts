import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spacing } from '../theme';

/**
 * Source-level guards for three layout defects that were measured off a device
 * screenshot rather than guessed at. Mobile tests are node-only — there is no
 * native render harness — so the mechanism is asserted where it is declared,
 * the same way `lib/layout-direction.spec.ts` does.
 */

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');

describe('borderless buttons align to the content margin', () => {
  const source = read('./Button.tsx');

  it('gives the ghost variant no horizontal padding', () => {
    // A ghost button paints neither fill nor border, so `paddingHorizontal`
    // only offsets its label from the margin. On the home screen that put
    // "See all" 16pt inside the right edge of every card beneath it.
    expect(source).toMatch(/paddingHorizontal:\s*resolvedVariant === 'ghost'\s*\?\s*0\s*:/);
  });

  it('keeps the touch target legal without that padding', () => {
    // Losing the padding narrows an inline ghost button, so the height and the
    // slop are what carry it over 44pt. Both must stay.
    expect(source).toMatch(/minHeight:\s*44/);
    expect(source).toMatch(/hitSlop=\{hitSlop\}/);
    expect(source).not.toContain('scale: pressed');
  });

  it('lets inline text actions keep their intrinsic width', () => {
    expect(source).toContain('flexShrink: 0');
  });
});

describe('pushed-screen header', () => {
  const source = read('./Header.tsx');

  it('centres a bodyStrong title over intrinsic-width side controls', () => {
    // The title must stay screen-centred, but the Review trailing "Retake" text
    // action needs its intrinsic width in Arabic instead of one cramped flex
    // share. The wider side becomes symmetric padding around the centred title.
    expect(source).toMatch(/variant="bodyStrong"/);
    expect(source).not.toMatch(/variant="title"/);
    expect(source).toContain("position: 'absolute'");
    expect(source).toContain('start: 0');
    expect(source).toContain('end: 0');
    expect(source).toContain('const sideInset = Math.max(sideWidths.start, sideWidths.end, 44)');
    expect(source).toContain('paddingHorizontal: sideInset + spacing.sm');
    expect(source).toContain("onLayout={measureSide('end')}");

    const trailingSlot =
      source.match(/<View onLayout=\{measureSide\('end'\)\}[\s\S]*?\{trailing\}<\/View>/)?.[0] ??
      '';
    expect(trailingSlot).not.toMatch(/flex:\s*1\b/);
  });

  it('backs out through a 44pt IconButton that mirrors in RTL', () => {
    // The old bare 26pt chevron relied on hitSlop for its touch target.
    expect(source).toMatch(/<IconButton[\s\S]*icon="back"[\s\S]*directional/);
    expect(source).toContain('tone="plain"');
  });
});

describe('surfaces', () => {
  it.each(['./Card.tsx', './Tile.tsx'])(
    '%s lifts with the J card shadow and cardEdge token',
    (file) => {
      const source = read(file);
      expect(source).toContain('colors.cardEdge');
      expect(source).toMatch(/shadow\.card/);
    },
  );

  it.each(['./Card.tsx', './Tile.tsx'])(
    '%s uses the shared 80ms press dimming instead of scale',
    (file) => {
      const source = read(file);
      expect(source).toContain('usePressFeedback');
      expect(source).toContain('pressFeedback.animatedStyle');
      expect(source).not.toContain('scale: pressed');
      expect(source).not.toContain('pressed ? 0.92');
    },
  );

  it('keeps deprecated gradient cards to a single content padding box', () => {
    const source = read('./Card.tsx');
    const baseBlock = source.match(/const base: ViewStyle = \{[\s\S]*?\n {2}\};/)?.[0] ?? '';

    expect(baseBlock).toContain('padding: gradient ? 0 : spacing.lg');
    expect(source).toContain('style={[{ padding: spacing.lg, gap: spacing.sm }, contentStyle]}');
    expect(source.match(/contentStyle/g) ?? []).toHaveLength(3);
  });

  it('a sheet floats on the sheet shadow and closes through a plain 44pt icon button', () => {
    const source = read('./Sheet.tsx');
    expect(source).toMatch(/shadow\.sheet/);
    expect(source).toMatch(/<IconButton[\s\S]*icon="close"/);
    expect(source).toMatch(/variant="title"/);
    expect(source).toContain('width: 36');
    expect(source).toContain('height: 4');
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

  it('uses the J gutter for padded page insets', () => {
    expect(source).toContain('padding: spacing.gutter');
    expect(source).toContain('gap: spacing.gutter');
  });
});

describe('home screen palette', () => {
  const source = read('../app/(tabs)/home.tsx');
  const weekSection = read('../features/home/WeekSection.tsx');

  it('renders the Home week progress through the shared Coral progress primitive', () => {
    expect(`${source}\n${weekSection}`).not.toMatch(/backgroundColor:\s*colors\.accent/);
    expect(`${source}\n${weekSection}`).not.toContain('WeekProgressBar');
    expect(weekSection).toContain('<Progress');
    expect(weekSection).toContain('<WeekStrip');
  });

  it('does not mark the Home action tiles with a drill-down chevron', () => {
    // Scan receipt and plan week are actions, not detail pages. A disclosure
    // indicator says "there is more underneath", which there is not.
    expect(source).not.toMatch(/showChevron/);
  });
});

describe('shop screen rhythm', () => {
  const source = read('../app/(tabs)/shopping.tsx');
  const addField = read('../features/shop/AddItemField.tsx');
  const row = read('../features/shop/ShoppingRow.tsx');

  it('lets the TabHeader own the top inset and keeps content on the J gutter', () => {
    expect(source).toContain('padded={false}');
    expect(source).toContain('paddingHorizontal: spacing.gutter');
    expect(source).toContain('gap: spacing.xl');
  });

  it('draws shopping rows as flat J rows, not padded cards', () => {
    expect(row).toContain('paddingVertical: 12');
    expect(row).toContain('gap: 14');
    expect(row).toContain('borderBottomWidth: 1');
    expect(row).toContain('borderBottomColor: colors.rowline');
  });

  it('keeps the add field square and on the J 48pt field rhythm', () => {
    expect(addField).toContain('minHeight: 48');
    expect(addField).toContain('borderRadius: radius.none');
    expect(addField).toContain('paddingHorizontal: 14');
  });
});

describe('G1 primitive extensions', () => {
  it('lets Tile replace the icon with a leading slot, fall back to ember and expose actions', () => {
    const source = read('./Tile.tsx');
    expect(source).toContain('leading?: ReactNode');
    expect(source).toContain("fill?: 'tint' | 'surfaceAlt'");
    expect(source).toContain('compact?: boolean');
    expect(source).toContain('variant?: TileVariant');
    expect(source).toContain('const PLACE_TILE_MIN_HEIGHT = 158');
    expect(source).toContain('const QUICK_ACTION_MIN_HEIGHT = 80');
    expect(source).toContain('function tileMinHeight');
    expect(source).toContain('padding: quickAction ? spacing.md : spacing.lg');
    expect(source).toContain("quickAction || fillMode === 'surfaceAlt'");
    expect(source).toContain('accessibilityRole?: AccessibilityRole');
    expect(source).toContain('accessibilityState?: AccessibilityState');
    expect(source).toContain('accessibilityActions');
    expect(source).toContain('onAccessibilityAction');
    expect(source).toContain('imageFailed');
    expect(source).toContain('onError={() => setImageFailed(true)}');
    expect(source).toContain('showPhotoFallback');
    expect(source).toMatch(/showPhotoFallback\s*=\s*photo && \(!image \|\| imageFailed\)/);
    expect(source).toContain('gradientHero');
    const fallbackBlock = source.match(/\{showPhotoFallback \? \([\s\S]*?\) : null\}/)?.[0] ?? '';
    expect(fallbackBlock).not.toContain('scrimGradient');
  });

  it('renders TabHeader accent text as primaryText in the same display line', () => {
    const source = read('./TabHeader.tsx');
    expect(source).toContain('titleAccent?: string');
    expect(source).toContain('color="primaryText"');
    expect(source).toContain('variant="display"');
  });

  it('keeps a 48pt IconButton target for the Tonight play control through the RoundButton adapter', () => {
    const iconButton = read('./IconButton.tsx');
    expect(iconButton).toContain('36 | 44 | 48');
    expect(iconButton).toContain('const targetSize = size === 48 ? 48 : ICON_BUTTON_TARGET_SIZE');

    const source = read('./RoundButton.tsx');
    expect(source).toContain('36 | 40 | 44 | 48');
    expect(source).toContain('ROUND_BUTTON_TARGET_SIZE = 44');
    expect(source).toContain('const mappedSize = size === 40 ? 44 : size');
  });
});
