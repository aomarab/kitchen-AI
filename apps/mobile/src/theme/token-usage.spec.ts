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

function lineNumberFor(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function borderRadiusViolations(content: string, file: string): string[] {
  const out: string[] = [];
  for (const match of content.matchAll(/borderRadius\s*:\s*([^,\n}\]]+)/g)) {
    const value = match[1]!.trim();
    if (value === '0' || value === 'radius.none') continue;
    if (value === 'radius.shutter' && file === join('features', 'capture', 'Shutter.tsx')) {
      continue;
    }
    out.push(`${file}:${lineNumberFor(content, match.index ?? 0)} borderRadius ${value}`);
  }
  return out;
}

function uppercaseTransformViolations(content: string, file: string): string[] {
  return [...content.matchAll(/textTransform\s*:\s*['"]uppercase['"]/g)].map(
    (match) => `${file}:${lineNumberFor(content, match.index ?? 0)} textTransform uppercase`,
  );
}

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
    'Checkbox.tsx': { path: 'components/Checkbox.tsx', pattern: /height:\s*(\d+)/ },
    'Field.tsx': {
      path: 'components/Field.tsx',
      pattern: /minHeight:\s*multiline \? 132 : (\d+)/,
    },
    'Header.tsx': { path: 'components/Header.tsx', pattern: /minHeight:\s*(\d+)/ },
    'AssistantSearchButton.tsx': {
      path: 'features/home/AssistantSearchButton.tsx',
      pattern: /ASSISTANT_SEARCH_TARGET_HEIGHT\s*=\s*(\d+)/,
    },
    'IconButton.tsx': {
      path: 'components/IconButton.tsx',
      pattern: /ICON_BUTTON_TARGET_SIZE\s*=\s*(\d+)/,
    },
    'QuantityStepper.tsx': {
      path: 'components/QuantityStepper.tsx',
      pattern: /STEPPER_TARGET_SIZE\s*=\s*(\d+)/,
    },
    'SearchField.tsx': { path: 'components/SearchField.tsx', pattern: /minHeight:\s*(\d+)/ },
    'SegmentedControl.tsx': {
      path: 'components/SegmentedControl.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'StarRating.tsx': { path: 'components/StarRating.tsx', pattern: /minHeight:\s*(\d+)/ },
    'TabBar.tsx': { path: 'components/TabBar.tsx', pattern: /minHeight:\s*(\d+)/ },
    'Tile.tsx': { path: 'components/Tile.tsx', pattern: /QUICK_ACTION_MIN_HEIGHT\s*=\s*(\d+)/ },
    'Toggle.tsx': { path: 'components/Toggle.tsx', pattern: /height:\s*(\d+)/ },
    'ToggleRow.tsx': {
      path: 'components/ToggleRow.tsx',
      pattern: /TOGGLE_ROW_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'BalanceTile.tsx': {
      path: 'features/credits/BalanceTile.tsx',
      pattern: /BALANCE_TILE_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'CreditPackCard.tsx': {
      path: 'features/credits/CreditPackCard.tsx',
      pattern: /CREDIT_PACK_ACTION_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'ArPins.tsx': { path: 'features/capture/ArPins.tsx', pattern: /minHeight:\s*(\d+)/ },
    'Shutter.tsx': {
      path: 'features/capture/Shutter.tsx',
      pattern: /SHUTTER_TOUCH_TARGET_SIZE\s*=\s*(\d+)/,
    },
    'QuestionTile.tsx': {
      path: 'features/capture/QuestionTile.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'ReviewEditSheet.tsx': {
      path: 'features/capture/ReviewEditSheet.tsx',
      pattern: /REVIEW_EDIT_ACTION_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'ReviewList.tsx': {
      path: 'features/capture/ReviewList.tsx',
      pattern: /REVIEW_FOOTER_ACTION_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'DayChipStrip.tsx': {
      path: 'features/plans/DayChipStrip.tsx',
      pattern: /DAY_CELL_HEIGHT\s*=\s*(\d+)/,
    },
    'shopping.tsx': { path: 'app/(tabs)/shopping.tsx', pattern: /size=\{(\d+)\}/ },
    'AddItemField.tsx': {
      path: 'features/shop/AddItemField.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'ShoppingCheckbox.tsx': {
      path: 'features/shop/ShoppingCheckbox.tsx',
      pattern: /SHOPPING_CHECKBOX_TARGET_SIZE\s*=\s*(\d+)/,
    },
    'ShoppingRow.tsx': {
      path: 'features/shop/ShoppingRow.tsx',
      pattern: /minHeight:\s*(\d+)/,
    },
    'recipe/[id]/index.tsx': {
      path: 'app/recipe/[id]/index.tsx',
      pattern: /RECIPE_FOOTER_ACTION_HEIGHT\s*=\s*(\d+)/,
    },
    'recipe/[id]/cook.tsx': {
      path: 'app/recipe/[id]/cook.tsx',
      pattern: /COOK_NAV_TARGET_HEIGHT\s*=\s*(\d+)/,
    },
    'RecipeIngredientRow.tsx': {
      path: 'features/recipe/RecipeIngredientRow.tsx',
      pattern: /RECIPE_INGREDIENT_ROW_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'item/[id].tsx': {
      path: 'app/item/[id].tsx',
      pattern: /ITEM_DETAIL_MIN_TOUCH_TARGET\s*=\s*(\d+)/,
    },
    'entry/[id].tsx': {
      path: 'app/entry/[id].tsx',
      pattern: /ENTRY_ACTION_ROW_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'screen.tsx': { path: 'app/screen.tsx', pattern: /KIOSK_EXIT_TARGET_SIZE\s*=\s*(\d+)/ },
    'wellness.tsx': {
      path: 'features/wellness/WellnessBlocks.tsx',
      pattern: /WELLNESS_ACTION_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'WeekStrip.tsx': {
      path: 'features/home/WeekStrip.tsx',
      pattern: /DAY_CELL_HEIGHT\s*=\s*(\d+)/,
    },
    'AccountHero.tsx': {
      path: 'features/account/AccountHero.tsx',
      pattern: /ACCOUNT_HERO_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'AssistantPersonaPicker.tsx': {
      path: 'features/settings/AssistantPersonaPicker.tsx',
      pattern: /PERSONA_OPTION_MIN_HEIGHT\s*=\s*(\d+)/,
    },
    'LiveAssistantScreen.tsx': {
      path: 'features/assistant/LiveAssistantScreen.tsx',
      pattern: /ASSISTANT_PROMPT_MIN_HEIGHT\s*=\s*(\d+)/,
    },
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
      if (file === 'Field.tsx') {
        expect(
          Number(match![1]),
          'J fields must use at least the 48pt spec §8 box',
        ).toBeGreaterThanOrEqual(48);
      }
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

  it('keeps Coral source square except the camera shutter', () => {
    const offenders = sourceFiles().flatMap((file) =>
      borderRadiusViolations(readFileSync(file, 'utf8'), relative(SRC, file)),
    );

    expect(
      offenders,
      'J Coral is square everywhere. Use radius.none/0, and reserve ' +
        `radius.shutter for features/capture/Shutter.tsx only. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('catches literal, token and computed border-radius violations', () => {
    const fixture = [
      'const size = 40;',
      'const styles = {',
      '  literal: { borderRadius: 8 },',
      '  token: { borderRadius: radius.md },',
      '  computed: { borderRadius: size / 2 },',
      '  allowedToken: { borderRadius: radius.none },',
      '  allowedLiteral: { borderRadius: 0 },',
      '};',
    ].join('\n');

    expect(borderRadiusViolations(fixture, join('components', 'Fake.tsx'))).toEqual([
      `${join('components', 'Fake.tsx')}:3 borderRadius 8`,
      `${join('components', 'Fake.tsx')}:4 borderRadius radius.md`,
      `${join('components', 'Fake.tsx')}:5 borderRadius size / 2`,
    ]);
    expect(
      borderRadiusViolations(
        'const ok = { borderRadius: radius.shutter };',
        join('features', 'capture', 'Shutter.tsx'),
      ),
    ).toEqual([]);
    expect(
      borderRadiusViolations(
        'const bad = { borderRadius: radius.shutter };',
        join('components', 'Fake.tsx'),
      ),
    ).toEqual([`${join('components', 'Fake.tsx')}:1 borderRadius radius.shutter`]);
  });

  it('never uppercases text through styles', () => {
    const offenders = sourceFiles().flatMap((file) =>
      uppercaseTransformViolations(readFileSync(file, 'utf8'), relative(SRC, file)),
    );

    expect(
      offenders,
      'J Coral uses sentence case in every locale. Do not set textTransform: ' +
        `'uppercase'. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('catches single- and double-quoted uppercase text transforms', () => {
    const fixture = [
      "const a = { textTransform: 'uppercase' };",
      'const b = { textTransform: "uppercase" };',
      "const ok = { textTransform: 'none' };",
    ].join('\n');

    expect(uppercaseTransformViolations(fixture, join('components', 'Fake.tsx'))).toEqual([
      `${join('components', 'Fake.tsx')}:1 textTransform uppercase`,
      `${join('components', 'Fake.tsx')}:2 textTransform uppercase`,
    ]);
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
