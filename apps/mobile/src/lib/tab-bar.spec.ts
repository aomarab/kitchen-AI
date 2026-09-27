import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_LIFT,
  TAB_BAR_SIDE_INSET,
  splitTabs,
  tabBarBottom,
  tabBarClearance,
} from './tab-bar';

const SRC = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

describe('floating tab bar geometry (spec §8.1)', () => {
  it('is a 68pt capsule inset 16 from the sides', () => {
    expect(TAB_BAR_HEIGHT).toBe(68);
    expect(TAB_BAR_SIDE_INSET).toBe(16);
  });

  it('floats 8pt above the home indicator', () => {
    expect(TAB_BAR_LIFT).toBe(8);
    expect(tabBarBottom(34)).toBe(42);
    expect(tabBarBottom(0)).toBe(8);
  });

  it('asks scroll content to clear the bar by 16 more', () => {
    expect(tabBarClearance(34)).toBe(34 + 8 + 68 + 16);
    expect(tabBarClearance(0)).toBe(8 + 68 + 16);
  });

  it('puts the capture column in the middle of the tabs', () => {
    expect(splitTabs(['home', 'kitchen', 'plans', 'shopping'])).toEqual({
      leading: ['home', 'kitchen'],
      trailing: ['plans', 'shopping'],
    });
  });
});

describe('floating tab bar', () => {
  const source = read('components/TabBar.tsx');

  it('floats over the screens as a pill on the raised shadow', () => {
    expect(source).toMatch(/position: 'absolute'/);
    expect(source).toMatch(/borderRadius: radius\.pill/);
    expect(source).toMatch(/shadow\.raised/);
    expect(source).toMatch(/isDark \? colors\.border/);
  });

  it('draws no pill behind the active tab', () => {
    expect(source).not.toMatch(/focused \? colors\.primarySoft/);
  });

  it('holds a 60pt camera', () => {
    expect(read('components/Fab.tsx')).toMatch(/width: 60,\s*height: 60/);
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
