import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMessageKey, translate } from '@kitchen/i18n';

const SRC = join(__dirname, '..');
const APP = join(SRC, 'app');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every row "More" held (spec §4.2). None of them may be dropped by the move. */
const ACCOUNT_DESTINATIONS = [
  '/profile',
  '/settings/household',
  '/ai-usage',
  '/screen',
  '/timers',
  '/wellness',
  '/settings/notifications',
  '/settings',
];

const ACCOUNT_KEYS = [
  'mobile.account.title',
  'mobile.more.profile',
  'mobile.more.household',
  'mobile.more.credits',
  'mobile.more.notifications',
  'mobile.more.settings',
  'mobile.more.signOut',
  'mobile.more.appVersion',
  'mobile.more.iconCredit',
  'mobile.screen.entry',
  'mobile.timers.entry',
  'mobile.wellness.entry',
];

describe('information architecture (spec §4)', () => {
  it('moves Shop into the tab group without changing its URL', () => {
    expect(existsSync(join(APP, '(tabs)', 'shopping.tsx'))).toBe(true);
    expect(existsSync(join(APP, 'shopping.tsx'))).toBe(false);
  });

  it('retires More', () => {
    expect(existsSync(join(APP, '(tabs)', 'more.tsx'))).toBe(false);
    for (const file of sourceFiles(SRC)) {
      expect(readFileSync(file, 'utf8'), `${file} still routes to /more`).not.toMatch(
        /['"`]\/(\(tabs\)\/)?more['"`]/,
      );
    }
  });

  it('orders the tabs Home · Kitchen · Plan · Shop', () => {
    const layout = read('app', '(tabs)', '_layout.tsx');
    const names = [...layout.matchAll(/<Tabs\.Screen\s+name="([\w-]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['home', 'kitchen', 'plans', 'shopping']);
    expect(layout).toContain("t('mobile.tabs.plan')");
    expect(layout).toContain("t('mobile.tabs.shop')");
    expect(layout).not.toContain("t('mobile.tabs.plans')");
    expect(layout).not.toContain("t('mobile.tabs.more')");
  });

  it('adds the new labels in both languages', () => {
    for (const key of ['mobile.tabs.plan', 'mobile.tabs.shop', 'mobile.account.title']) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      // Arabic is typed against English, so a missing key fails the build; a
      // copied English string would not.
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }
  });

  it('gives Account every destination and label More had', () => {
    const account = read('app', 'account.tsx');
    for (const href of ACCOUNT_DESTINATIONS) {
      expect(account, `Account lost the ${href} row`).toContain(`'${href}'`);
    }
    for (const key of ACCOUNT_KEYS) {
      expect(account, `Account no longer renders ${key}`).toContain(`'${key}'`);
    }
    // Shop is a tab now; a row for it would be a second way to the same place.
    expect(account).not.toContain('mobile.more.shopping');
  });

  it('puts the avatar on every tab screen', () => {
    for (const tab of ['home', 'kitchen', 'plans', 'shopping']) {
      expect(read('app', '(tabs)', `${tab}.tsx`), `${tab} has no TabHeader`).toContain(
        '<TabHeader',
      );
    }
    expect(read('components', 'TabHeader.tsx')).toContain('<AccountButton');
  });

  it('draws the avatar as a 36pt soft RoundButton that opens Account', () => {
    const button = read('components', 'AccountButton.tsx');
    expect(button).toContain('<RoundButton');
    expect(button).toContain('size={36}');
    expect(button).toContain('tone="soft"');
    expect(button).toContain("router.push('/account')");
    expect(button).toContain("t('mobile.account.title')");
  });

  it('lays grouped rows out at 56pt (spec §9.7)', () => {
    const row = read('components', 'ListRow.tsx');
    expect(row).toMatch(/grouped\s*\?\s*\{[^}]*minHeight:\s*56/);
  });

  it('keeps inline tab controls named and inside safe areas (spec §12)', () => {
    const shopping = read('app', '(tabs)', 'shopping.tsx');
    const checkbox = shopping.match(
      /<Pressable[\s\S]*?accessibilityRole="checkbox"[\s\S]*?style=\{\{([\s\S]*?)\}\}/,
    );
    const checkboxSource = checkbox?.[0] ?? '';
    const checkboxStyle = checkbox?.[1] ?? '';

    expect(checkboxSource, 'shopping checkbox Pressable is missing').not.toBe('');
    expect(checkboxStyle, 'shopping checkbox touch target width is below 44pt').toMatch(
      /(?:minWidth|width):\s*44/,
    );
    expect(checkboxStyle, 'shopping checkbox touch target height is below 44pt').toMatch(
      /(?:minHeight|height):\s*44/,
    );
    expect(checkboxSource, 'shopping checkbox must be named for its item').not.toContain(
      "accessibilityLabel={t('shopping.purchased')}",
    );
    expect(checkboxSource, 'shopping checkbox label should use the localized item name').toMatch(
      /accessibilityLabel=\{(?:itemLabel|localizedName\(locale,\s*item\.nameEn,\s*item\.nameAr\))\}/,
    );

    const kitchen = read('app', '(tabs)', 'kitchen.tsx');
    expect(kitchen).not.toContain("edges={['top']}");
    expect(kitchen).toContain("edges={['top', 'left', 'right']}");
  });
});
