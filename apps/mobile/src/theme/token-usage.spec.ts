import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/**
 * Every TypeScript source file in the app except the tests themselves.
 */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(SRC);
  return out;
}

/**
 * `theme/index.ts` computes the scaled line box; `AppText.tsx` is the single
 * primitive that applies it. Everywhere else, an absolute `lineHeight` opts
 * that text out of font scaling and clips it at large accessibility sizes.
 */
const LINE_HEIGHT_ALLOWED = [join('theme', 'index.ts'), join('components', 'AppText.tsx')];

describe('mobile source sweep', () => {
  /**
   * Apple requires a 44pt minimum touch target and Android 48dp. A regex sweep
   * over every file produces false positives — hairline dividers legitimately
   * set `height: 1`, and `shadowOffset` contains its own `height` — so each
   * interactive control is named with the property that carries its touch
   * dimension. Adding a control means adding a line here, which is the point:
   * it forces the size to be a decision rather than an accident.
   */
  const TOUCH_TARGETS: Record<string, { path: string; pattern: RegExp }> = {
    'Button.tsx': { path: 'components/Button.tsx', pattern: /minHeight:\s*(\d+)/ },
    'Fab.tsx': { path: 'components/Fab.tsx', pattern: /height:\s*(\d+)/ },
    'Field.tsx': { path: 'components/Field.tsx', pattern: /minHeight:\s*(\d+)/ },
    'Header.tsx': { path: 'components/Header.tsx', pattern: /minHeight:\s*(\d+)/ },
    'QuantityStepper.tsx': { path: 'components/QuantityStepper.tsx', pattern: /height:\s*(\d+)/ },
    // The visual circle is 36-40pt; the Pressable around it is what is measured.
    'RoundButton.tsx': { path: 'components/RoundButton.tsx', pattern: /height:\s*(\d+)/ },
    'SegmentedControl.tsx': {
      path: 'components/SegmentedControl.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'StarRating.tsx': { path: 'components/StarRating.tsx', pattern: /minHeight:\s*(\d+)/ },
    'TabBar.tsx': { path: 'components/TabBar.tsx', pattern: /minHeight:\s*(\d+)/ },
    'Tile.tsx': { path: 'components/Tile.tsx', pattern: /minHeight:\s*(\d+)/ },
    'ArPins.tsx': { path: 'features/capture/ArPins.tsx', pattern: /minHeight:\s*(\d+)/ },
    'Shutter.tsx': { path: 'features/capture/Shutter.tsx', pattern: /width:\s*(\d+)/ },
    'QuestionTile.tsx': {
      path: 'features/capture/QuestionTile.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'ReviewEditSheet.tsx': {
      path: 'features/capture/ReviewEditSheet.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'ReviewList.tsx': { path: 'features/capture/ReviewList.tsx', pattern: /minHeight:\s*(\d+)/ },
    'DayChipStrip.tsx': {
      path: 'features/plans/DayChipStrip.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'shopping.tsx': { path: 'app/(tabs)/shopping.tsx', pattern: /size=\{(\d+)\}/ },
    'AddItemField.tsx': {
      path: 'features/shop/AddItemField.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'ShoppingCheckbox.tsx': {
      path: 'features/shop/ShoppingCheckbox.tsx',
      pattern: /height:\s*(\d+)/,
    },
    'ShoppingRow.tsx': {
      path: 'features/shop/ShoppingRow.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'recipe/[id]/index.tsx': { path: 'app/recipe/[id]/index.tsx', pattern: /height:\s*(\d+)/ },
    'recipe/[id]/cook.tsx': { path: 'app/recipe/[id]/cook.tsx', pattern: /height:\s*(\d+)/ },
  };

  it('keeps every interactive control at or above the 44pt minimum', () => {
    for (const [file, target] of Object.entries(TOUCH_TARGETS)) {
      const content = readFileSync(join(SRC, target.path), 'utf8');
      const match = content.match(target.pattern);
      expect(
        match,
        `${file} no longer declares the touch dimension this guard tracks. If ` +
          'the control was restyled, update the pattern; do not delete the entry.',
      ).not.toBeNull();
      expect(
        Number(match![1]),
        `${file} renders a touch target below the 44pt minimum Apple requires ` +
          '(Android asks for 48dp). Small targets are a rejection risk and a ' +
          'real barrier for anyone with a motor impairment.',
      ).toBeGreaterThanOrEqual(44);
    }
  });

  it('never sets a raw lineHeight outside the theme', () => {
    const offenders = sourceFiles()
      .filter((file) => !LINE_HEIGHT_ALLOWED.some((allowed) => file.endsWith(allowed)))
      .filter((file) => /lineHeight\s*:/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));

    expect(
      offenders,
      'An absolute lineHeight outside theme/index.ts bypasses the font-scale ' +
        'maths, so React Native grows the text but not the box that holds it ' +
        'and the text clips at large Dynamic Type sizes. Use a typography ' +
        `variant instead. Offending files: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * `Screen` is the only thing in the app that mounts a KeyboardAvoidingView,
   * and `Field` is the only thing that renders a TextInput. So a route that
   * shows a Field without going through Screen — directly, or via AuthLayout,
   * which wraps one — puts the keyboard over its own input on iOS, where the
   * window does not resize the way Android's does.
   *
   * The check has to follow composition rather than read one file: the capture
   * fields live in `features/capture/*`, three levels below the route that
   * mounts them, and the auth screens reach Screen through AuthLayout. So each
   * route is expanded through its relative imports and judged on the whole
   * tree, with the wrapper required on the route itself — the top of it.
   *
   * This is structural because it cannot be behavioural here: taps cannot be
   * driven on this machine, so the property is held by construction rather
   * than by demonstration.
   */
  it('renders every text input inside a keyboard-aware Screen', () => {
    /** Source of `file` plus every file it reaches through relative imports. */
    const expand = (file: string, seen = new Set<string>()): string => {
      if (seen.has(file)) return '';
      seen.add(file);
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        return '';
      }
      const imports = [...content.matchAll(/from\s+'(\.[^']*)'/g)].map((m) => m[1]!);
      const resolved = imports.flatMap((spec) => {
        const base = join(file, '..', spec);
        return [
          `${base}.tsx`,
          `${base}.ts`,
          join(base, 'index.tsx'),
          join(base, 'index.ts'),
        ].filter((candidate) => {
          try {
            return statSync(candidate).isFile();
          } catch {
            return false;
          }
        });
      });
      return content + resolved.map((next) => expand(next, seen)).join('');
    };

    const routes = sourceFiles().filter((file) => file.includes(join(SRC, 'app')));
    const offenders = routes
      .filter((file) => /<Field\b/.test(expand(file)))
      .filter((file) => !/<(Screen|AuthLayout)\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));

    expect(
      offenders,
      'A Field outside Screen/AuthLayout has no KeyboardAvoidingView above it, ' +
        'so on iOS the keyboard covers the input the user is typing into — the ' +
        "window does not resize the way Android's does. Wrap the route in " +
        `Screen. Offending routes: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * The same hole, from the other side: `Sheet` renders in a Modal, which is a
   * sibling of Screen's KeyboardAvoidingView rather than a child, so a Field
   * inside a Sheet is unprotected even on a screen that passes the check above.
   * Sheet answers that with its own avoidance, which is what makes a Field in
   * one safe — so guard the property the fields depend on, at the source.
   */
  it('gives the sheet its own keyboard avoidance', () => {
    const sheet = readFileSync(join(SRC, 'components/Sheet.tsx'), 'utf8');

    expect(
      /<KeyboardAvoidingView/.test(sheet),
      'Sheet renders in a Modal, which is hosted outside the root view and so ' +
        'sits beside the KeyboardAvoidingView that Screen mounts rather than ' +
        'inside it. Without its own, the iOS keyboard covers any Field a sheet ' +
        'holds — and several sheets hold one.',
    ).toBe(true);

    expect(
      /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/.test(sheet),
      'Expo sets softwareKeyboardLayoutMode="resize", so Android already ' +
        'shrinks the window. A behavior on both platforms double-adjusts there ' +
        'and pushes the sheet off-screen.',
    ).toBe(true);
  });
});
