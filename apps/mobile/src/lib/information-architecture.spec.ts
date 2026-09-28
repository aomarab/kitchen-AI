import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMessageKey, translate } from '@kitchen/i18n';

const SRC = join(__dirname, '..');
const APP = join(SRC, 'app');
const MOBILE = join(SRC, '..');
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

  it('keeps the Plan surfaces on the G7 Bento contract', () => {
    const plans = read('app', '(tabs)', 'plans.tsx');
    expect(plans).toContain('<DayChipStrip');
    expect(plans).toContain('<PlanTiles');

    const tiles = read('features', 'plans', 'PlanTiles.tsx');
    expect(tiles).toContain("'mobile.plans.cookedCaption'");
    expect(tiles).toContain("'mobile.plans.toBuyCaption'");
    expect(tiles).not.toContain('name="warning"');
    expect(tiles).not.toContain('icon="warning"');
    for (const key of ['mobile.plans.cookedCaption', 'mobile.plans.toBuyCaption']) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }

    const generate = read('app', 'generate-plan.tsx');
    expect(generate).toContain('<OrbMascot');
    expect(generate).toContain('state="looking"');
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
    const checkboxFile = read('features', 'shop', 'ShoppingCheckbox.tsx');
    expect(checkboxFile, 'shopping checkbox Pressable is missing').toContain(
      'accessibilityRole="checkbox"',
    );
    expect(checkboxFile, 'shopping checkbox touch target width is below 44pt').toMatch(
      /(?:minWidth|width):\s*44/,
    );
    expect(checkboxFile, 'shopping checkbox touch target height is below 44pt').toMatch(
      /(?:minHeight|height):\s*44/,
    );
    expect(checkboxFile, 'shopping checkbox label should be injected by its row').toContain(
      'accessibilityLabel={label}',
    );
    const row = read('features', 'shop', 'ShoppingRow.tsx');
    expect(row, 'shopping row must pass a sentence label to the checkbox').toContain(
      'accessibilityLabel',
    );
    expect(row, 'purchased shopping rows should be struck through').toContain(
      "textDecorationLine: 'line-through'",
    );
    expect(
      checkboxFile,
      'unchecked shopping checkbox ring must use the accessible token',
    ).toContain('colors.textMuted');
    expect(checkboxFile, 'unchecked shopping checkbox ring must be 1.5pt').toContain(
      'borderWidth: checked ? 1 : 1.5',
    );
    expect(
      checkboxFile,
      'shopping checkbox tick must use the semantic success label token',
    ).toContain('colors.onSuccess');

    const kitchen = read('app', '(tabs)', 'kitchen.tsx');
    expect(kitchen).not.toContain("edges={['top']}");
    expect(kitchen).toContain("edges={['top', 'left', 'right']}");
  });

  it('keeps Shop on native sharing and catalog-only adds (spec §9.7)', () => {
    const shopping = read('app', '(tabs)', 'shopping.tsx');
    expect(shopping).toContain('Share.share');
    expect(shopping).toContain('formatShoppingListForShare');
    expect(shopping).toContain('useSearchIngredients');
    expect(shopping).toContain('useAddShoppingItems');
    expect(shopping).toContain('ingredientId: ingredient.id');
    expect(shopping, 'Share dismissals should not show failure feedback').toContain(
      'Share.dismissedAction',
    );
    expect(shopping, 'Shop action failures should use the standard error mapping').toContain(
      'errorMessageKey',
    );
    expect(
      shopping,
      'Shop add success should clear the field only after the mutation succeeds',
    ).toContain('onSuccess: () => setTerm');
    expect(shopping, 'Shop mutations should surface failures').toContain('onError');
    expect(shopping, 'Shop must not send free-text names to addShoppingItems').not.toMatch(
      /items:\s*\[\s*\{[\s\S]*?(?:name|label|rawName)\s*:/,
    );
  });

  it('keeps sticky footer and toast geometry above the floating tab bar', () => {
    const screen = read('components', 'Screen.tsx');
    const toast = read('components', 'Toast.tsx');
    expect(screen).toContain('tabBar && !hasFooter');
    expect(screen).toContain('onFooterLayout');
    expect(screen).toContain('setToastFooterOffset(event.nativeEvent.layout.height)');
    expect(toast).toContain('footerOffset > 0 ? footerOffset : clearance');
  });

  it('keeps the Shop add field aligned and typed like shared fields', () => {
    const addField = read('features', 'shop', 'AddItemField.tsx');
    expect(addField).toContain("textAlign: 'auto'");
    expect(addField).toContain('writingDirection: dir');
    expect(addField).toContain('resolveFontFamily');
    expect(addField).toContain('autoCorrect={false}');
    expect(addField).toContain('autoCapitalize="none"');
  });

  it('keeps Kitchen wired to the G2 screen contract', () => {
    const kitchen = read('app', '(tabs)', 'kitchen.tsx');

    expect(kitchen, "Kitchen's add button must open manual capture").toContain(
      "'/capture?method=manual'",
    );
    expect(kitchen, 'Kitchen must validate the sort param through parseSort').toContain(
      'parseSort(params.sort)',
    );
    expect(
      kitchen.match(/params\.sort/g) ?? [],
      'The sort param is a seed and must not be read outside parseSort',
    ).toHaveLength(1);
    expect(kitchen).not.toContain('From scan');
    expect(kitchen).not.toMatch(/provenance/i);
    expect(kitchen).not.toMatch(/sourceLabel|sourceKey/);
    expect(kitchen).toMatch(
      /<RoundButton[\s\S]*icon=\{searchOpen \? 'close' : 'search'\}[\s\S]*accessibilityLabel=\{searchLabel\}/,
    );
    expect(kitchen).toMatch(/<RoundButton[\s\S]*icon="plus"[\s\S]*accessibilityLabel=\{addLabel\}/);

    const compactPlaceTile =
      kitchen.match(/function CompactPlaceContent[\s\S]*?function MiniItemCard/)?.[0] ?? '';
    expect(compactPlaceTile, 'compact place tiles must use numeral counts').toContain(
      'variant="numeral"',
    );
    expect(
      compactPlaceTile,
      'place tiles grow with Dynamic Type instead of truncating count or label text',
    ).not.toContain('numberOfLines');
  });

  it('keeps the redesigned Home tab inside the G1 screen scope', () => {
    const home = read('app', '(tabs)', 'home.tsx');

    expect(home).not.toContain('bell');
    expect(home).not.toContain('StatTiles');
    expect(home).not.toContain('KitchenGlance');
    expect(existsSync(join(SRC, 'features', 'home', 'StatTiles.tsx'))).toBe(false);
    expect(existsSync(join(SRC, 'features', 'home', 'KitchenGlance.tsx'))).toBe(false);

    for (const route of [
      '/recipe/',
      '/cook',
      '/kitchen',
      '/assistant',
      '/buy-credits',
      '/capture?method=receipt',
      '/generate-plan',
      '/plans',
    ]) {
      expect(home, `Home no longer routes to ${route}`).toContain(route);
    }
  });

  it('mirrors only the Home arrow affordance, not the media play glyph', () => {
    const home = read('app', '(tabs)', 'home.tsx');
    expect(home).toContain('<RoundButton');
    expect(home).toContain('icon="play"');
    expect(home).not.toContain('<DirectionalIcon name="play"');
    expect(home).toContain('<DirectionalIcon name="arrowForward"');
  });

  it('keeps the empty Tonight tile at the populated Tonight height', () => {
    const home = read('app', '(tabs)', 'home.tsx');
    expect(home).toMatch(
      /tint="apricot"[\s\S]*?height=\{220\}[\s\S]*?accessibilityLabel=\{t\('mobile\.home\.tonightEmpty'\)\}/,
    );
  });

  it('keeps Recipe on the G9 screen contract', () => {
    const recipe = read('app', 'recipe', '[id]', 'index.tsx');

    expect(recipe).toContain('<RecipeThumb');
    expect(recipe).toContain('height: 360');
    expect(recipe).toContain('const TOP_BAR_ROW_HEIGHT = 44');
    expect(recipe).toContain('const TOP_BAR_FADE_MS = 160');
    expect(recipe).toContain('recipeTopBarBacked');
    expect(recipe).toContain('useReduceMotion');
    expect(recipe).toContain('Animated.timing(barOpacity');
    expect(recipe).toContain('useNativeDriver: true');
    expect(recipe).toContain('pointerEvents="none"');
    expect(recipe).toContain('StyleSheet.hairlineWidth');
    expect(recipe).toContain("tone={barBacked ? 'surface' : 'mediaLight'}");
    expect(recipe).toContain('showLightStatusBar');
    expect(recipe).toContain('!barBacked');
    expect(recipe).not.toContain('heroUnderStatus');
    expect(recipe).toContain('onImageLoad');
    expect(recipe).toContain('onScroll={handleRecipeScroll}');
    expect(recipe).toContain('top: insets.top + spacing.md');
    expect(recipe).toContain('<StatusBar style="light" />');
    expect(recipe).toContain('recipeStockCount');
    expect(recipe).toContain('scaleQuantityForServings');
    expect(recipe).toContain('<SegmentedControl');
    expect(recipe).toContain("segment === 'steps'");
    expect(recipe).toContain('<YoutubePlayer');
    expect(recipe).toContain('mobile.recipe.minutesValue');
    expect(recipe).toContain('mobile.recipe.totalTimeLabel');
    expect(recipe).toContain('mobile.recipe.difficultyLabel');
    expect(recipe).not.toMatch(/heart/i);
  });

  it('keeps Cook on the G9 screen contract', () => {
    const cook = read('app', 'recipe', '[id]', 'cook.tsx');

    expect(cook).toContain('useKeepAwake()');
    expect(cook).toContain("direction: 'ltr'");
    expect(cook).toContain('accessibilityRole="progressbar"');
    expect(cook).toContain(
      'accessibilityValue={{ min: 0, max: total, now: step + 1, text: progressLabel }}',
    );
    expect(cook).toContain('<OrbMascot');
    expect(cook).toContain('stepIngredients(');
    expect(cook).toContain('parseServingsParam');
    expect(cook).toContain('projectTimer(existing, now)');
    expect(cook).toContain('initialMode="voice"');
    expect(cook).toContain('lockMode');
    expect(cook).toContain("backgroundColor: 'transparent'");

    const timerControl = cook.match(/function StepTimerControl[\s\S]*/)?.[0] ?? '';
    expect(timerControl).toContain('<Button');
    expect(timerControl).not.toMatch(/\n\s+accessible\b/);
    expect(timerControl).not.toContain('accessibilityLabel={caption}');
  });

  it('adds the G9 recipe labels in both languages', () => {
    for (const key of [
      'mobile.recipe.inStockOf',
      'mobile.recipe.inStockLabel',
      'mobile.recipe.upNext',
      'mobile.recipe.servingsLabel',
      'mobile.recipe.minutesValue',
      'mobile.recipe.totalTimeLabel',
      'mobile.recipe.difficultyLabel',
    ]) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }
  });

  it('keeps Welcome on the Apricot Bento screen contract', () => {
    const welcome = read('app', '(auth)', 'welcome.tsx');

    expect(welcome).toContain('welcome-produce.jpg');
    expect(welcome).toContain('welcome-salad.jpg');
    expect(welcome).toContain("t('mobile.welcome.collageLabel')");
    expect(welcome).toContain("t('auth.signIn')");
    expect(welcome).not.toContain('surfaceInverse');
    expect(welcome).not.toContain('snapTitle');
    expect(welcome).not.toContain('tagline');
    expect(welcome).toContain('const WELCOME_SECTION_GAP = spacing.sm;');
    expect(welcome).toContain('style={{ gap: 0 }}');
    expect(welcome).toContain('style={{ flexGrow: 1 }}');
    expect(welcome).not.toContain('minHeight: spacing.md');

    for (const key of [
      'mobile.welcome.headline',
      'mobile.welcome.headlineAccent',
      'mobile.welcome.subtitle',
      'mobile.welcome.collageLabel',
      'mobile.welcome.collage.tomatoes',
      'mobile.welcome.collage.carrots',
      'mobile.welcome.collage.itemsSpotted',
      'mobile.welcome.collage.freshFor',
      'mobile.welcome.collage.tonight',
      'mobile.welcome.haveAccountShort',
    ]) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }

    for (const file of ['welcome-produce.jpg', 'welcome-salad.jpg']) {
      const path = join(MOBILE, 'assets', 'images', file);
      expect(existsSync(path), `${file} is missing`).toBe(true);
      expect(statSync(path).size, `${file} is larger than 160 KiB`).toBeLessThanOrEqual(160 * 1024);
    }

    const collage = read('features', 'welcome', 'WelcomeCollage.tsx');
    expect(collage).toContain('function FloatingLeafCircle');
    expect(collage).toContain("position: 'absolute'");
    expect(collage).not.toContain('leading={<LeafCircle />}');
  });
});
