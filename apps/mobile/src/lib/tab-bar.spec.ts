import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_HORIZONTAL_PADDING,
  TAB_BAR_LIFT,
  TAB_BAR_SIDE_INSET,
  TAB_BAR_TOP_PADDING,
  splitTabs,
  tabBarBottom,
  tabBarClearance,
} from './tab-bar';

const SRC = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

describe('J tab bar geometry (spec §8)', () => {
  it('is a flat 50pt bar body pinned to the screen edge', () => {
    expect(TAB_BAR_HEIGHT).toBe(50);
    expect(TAB_BAR_SIDE_INSET).toBe(0);
    expect(TAB_BAR_LIFT).toBe(0);
    expect(TAB_BAR_TOP_PADDING).toBe(6);
    expect(TAB_BAR_HORIZONTAL_PADDING).toBe(8);
  });

  it('includes the safe-area bottom inset inside the flat bar', () => {
    expect(tabBarBottom(34)).toBe(0);
    expect(tabBarBottom(0)).toBe(0);
    expect(tabBarClearance(34)).toBe(34 + 50 + 16);
    expect(tabBarClearance(0)).toBe(50 + 16);
  });

  it('puts the capture column in the middle of the tabs', () => {
    expect(splitTabs(['home', 'kitchen', 'plans', 'shopping'])).toEqual({
      leading: ['home', 'kitchen'],
      trailing: ['plans', 'shopping'],
    });
  });
});

describe('J tab bar source', () => {
  const source = read('components/TabBar.tsx');

  it('draws a flat top-hairline bar, not the retired floating pill', () => {
    expect(source).toMatch(/position: 'absolute'/);
    expect(source).toContain('bottom: tabBarBottom(insets.bottom)');
    expect(source).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(source).toContain('backgroundColor: colors.bg');
    expect(source).not.toMatch(/borderRadius: radius\.pill/);
    expect(source).not.toMatch(/shadow\.raised/);
    expect(source).not.toContain('<Fab');
  });

  it('draws equal icon-only phone slots with an active marker and tablet labels', () => {
    expect(source).toContain('style={{ flex: 1, minHeight: 44');
    expect(source).toContain('size: 24');
    expect(source).toContain('ACTIVE_MARKER_SIZE = 4');
    expect(source).toContain('gap: 5');
    expect(source).toContain('TABLET_LABEL_BREAKPOINT = 600');
    expect(source).toContain('variant="tab"');
  });

  it('passes 24pt glyphs from the tab layout while leaving the scan key unchanged', () => {
    const layout = read('app/(tabs)/_layout.tsx');
    expect(layout).toContain('<Icon name="home" color={color} size={24} />');
    expect(layout).toContain('<Icon name="fridge" color={color} size={24} />');
    expect(layout).toContain('<Icon name="calendar" color={color} size={24} />');
    expect(layout).toContain('<Icon name="bag" color={color} size={24} />');
    expect(source).toContain('Icon name="scan" size={22} color={colors.onFill}');
  });

  it('keeps the centre scan action as a 52×40 primary key with a 44pt target', () => {
    expect(source).toContain('SCAN_KEY_WIDTH = 52');
    expect(source).toContain('SCAN_KEY_HEIGHT = 40');
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('accessibilityLabel={captureLabel}');
    expect(source).toContain('minHeight: 44');
    expect(source).toContain('Icon name="scan" size={22} color={colors.onFill}');
  });

  it('keeps selected state and accessibility labels on every tab slot', () => {
    expect(source).toContain('accessibilityRole="tab"');
    expect(source).toContain('accessibilityState={{ selected: focused }}');
    expect(source).toContain('accessibilityLabel={options.title}');
  });

  it('uses shared press feedback for tab slots and the scan key', () => {
    expect(source).toContain('usePressFeedback');
    expect(source).toContain('pressFeedback.pressHandlers');
    expect(source).toContain('pressFeedback.animatedStyle');
  });

  /**
   * The bar covers the bottom of every tab screen, so each one must pad its
   * content past it: through `Screen`'s `tabBar` prop, or by reading the
   * clearance itself for a FlatList.
   */
  it.each(
    readdirSync(join(SRC, 'app', '(tabs)')).filter(
      (file) => file.endsWith('.tsx') && file !== '_layout.tsx',
    ),
  )('(tabs)/%s clears the bar', (file) => {
    const screen = read(join('app', '(tabs)', file));
    expect(screen).toMatch(/<Screen[^>]*\btabBar\b|useTabBarClearance\(\)/);
  });
});
