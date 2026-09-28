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

  it('draws the avatar as a 44pt AccountButton around a 32pt J avatar', () => {
    const button = read('components', 'AccountButton.tsx');
    expect(button).toContain('<Pressable');
    expect(button).toContain('width: 44');
    expect(button).toContain('height: 44');
    expect(button).toContain('<Avatar');
    expect(button).toContain('size={32}');
    expect(button).toContain('usePressFeedback');
    expect(button).toContain("router.push('/account')");
    expect(button).toContain("t('mobile.account.title')");
  });

  it('lays every flat J row out at 56pt with a rowline', () => {
    const row = read('components', 'ListRow.tsx');
    expect(row).toMatch(/minHeight:\s*56/);
    expect(row).toContain('borderBottomColor: colors.rowline');
    expect(row).toContain('/** @deprecated J: removed in C16. Rows are flat in every group. */');
  });

  it('keeps Account and Settings rows on the grouped G10 contract (spec §9.7)', () => {
    const themePicker = read('features', 'settings', 'ThemePicker.tsx');
    expect(themePicker, 'ThemePicker must use the shared segmented control').toContain(
      '<SegmentedControl',
    );
    expect(themePicker, 'ThemePicker must not keep its hand-rolled Pressable track').not.toContain(
      'Pressable',
    );

    const settings = read('app', 'settings', 'index.tsx');
    expect(settings, 'Settings navigation groups should use shared ListGroup columns').toContain(
      '<ListGroup',
    );
    const rows = settings.match(/<ListRow[\s\S]*?\/>/g) ?? [];
    expect(rows.length, 'Settings should render navigation rows').toBeGreaterThan(0);
    for (const row of rows) {
      expect(row, `Settings navigation row is not grouped:\n${row}`).toContain('grouped');
    }

    const deleteAccount = read('app', 'settings', 'delete-account.tsx');
    expect(deleteAccount, 'Delete account must keep the destructive CTA tone').toContain(
      'variant="danger"',
    );

    const toggleRow = read('components', 'ToggleRow.tsx');
    expect(toggleRow, 'ToggleRow should use the J square Toggle primitive').toContain('<Toggle');
    expect(toggleRow, 'ToggleRow should not wrap the native Switch after C3').not.toContain(
      '<Switch',
    );
    expect(toggleRow, 'ToggleRow should delegate structure to the flat J ListRow').toContain(
      '<ListRow',
    );
    expect(toggleRow, 'ToggleRow should preserve the 56pt row target').toContain(
      'TOGGLE_ROW_MIN_HEIGHT = 56',
    );
    const toggle = read('components', 'Toggle.tsx');
    expect(toggle, 'Toggle knob motion must mirror under the app RTL direction').toContain(
      "dir === 'rtl' ? -TOGGLE_TRAVEL : TOGGLE_TRAVEL",
    );

    const household = read('app', 'settings', 'household.tsx');
    const inviteActions =
      household.match(
        /t\('household\.shareInvite'\)[\s\S]*?t\('mobile\.settings\.newInviteCode'\)/,
      )?.[0] ?? '';
    expect(inviteActions, 'Household invite actions should render in order').toContain(
      "t('mobile.settings.newInviteCode')",
    );
    expect(inviteActions, 'Household invite actions must stack, not share one row').not.toContain(
      "flexDirection: 'row'",
    );
    expect(
      inviteActions,
      'Household invite buttons must be full-width, not half-width',
    ).not.toContain('flex: 1');
  });

  it('keeps inline tab controls named and inside safe areas (spec §12)', () => {
    const checkboxFile = read('features', 'shop', 'ShoppingCheckbox.tsx');
    expect(checkboxFile, 'shopping checkbox should delegate to the J Checkbox primitive').toContain(
      '<Checkbox',
    );
    const checkbox = read('components', 'Checkbox.tsx');
    expect(checkbox, 'shopping checkbox Pressable is missing').toContain(
      'accessibilityRole="checkbox"',
    );
    expect(checkbox, 'shopping checkbox touch target width is below 44pt').toMatch(
      /(?:minWidth|width):\s*44/,
    );
    expect(checkbox, 'shopping checkbox touch target height is below 44pt').toMatch(
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
    expect(checkbox, 'unchecked shopping checkbox ring must use the control token').toContain(
      'colors.control',
    );
    expect(checkbox, 'unchecked shopping checkbox ring must be 1.5pt').toContain(
      'borderWidth: checked ? 0 : 1.5',
    );
    expect(checkbox, 'shopping checkbox tick must use the onFill label token').toContain(
      'colors.onFill',
    );

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

  it('keeps Item detail on the append-only event-ledger contract (spec §9.7)', () => {
    const item = read('app', 'item', '[id].tsx');

    expect(item, 'Item detail must read household event history').toContain('useInventoryEvents');
    expect(item, 'Item detail must filter history through the pure helper').toContain(
      'itemHistory(eventsQuery.data ?? [], item.id)',
    );
    expect(item, 'Quantity changes must keep using the append-only event hook').toContain(
      'useAdjustQuantity',
    );
    expect(
      item,
      'The quantity stepper must still write corrected deltas to useAdjustQuantity, not updateInventoryItem',
    ).toContain("adjust.mutate({ itemId: item.id, delta, unit: item.unit, reason: 'corrected' })");
    expect(
      item,
      'The variable-length expiry badge belongs in the body, not Header trailing',
    ).not.toMatch(/<Header[\s\S]*?trailing=/);
    expect(item, 'Item mini tiles must use the shared Bento primitive').toContain('<Bento>');
    expect(item, 'Item mini tiles must use shared Tile, not a screen-local MiniTile').not.toContain(
      'MiniTile',
    );
    expect(item, 'History loading must use the shared compact LoadingState').toContain(
      '<LoadingState compact',
    );
    expect(item, 'History errors must use the shared compact ErrorState').toMatch(
      /<ErrorState[\s\S]*?\bcompact\b/,
    );
  });

  it('keeps Entry detail on shared Bento tiles and status semantics (spec §9.7)', () => {
    const entry = read('app', 'entry', '[id].tsx');
    const board = read('features', 'plans', 'PlanBoard.tsx');

    expect(entry, 'Entry mini tiles must use the shared Bento primitive').toContain('<Bento>');
    expect(
      entry,
      'Entry mini tiles must use shared Tile, not a screen-local MiniTile',
    ).not.toContain('MiniTile');
    expect(entry, 'Entry status title must be a stable label, not badge copy').toContain(
      "t('mobile.plans.status')",
    );
    const dateTile =
      entry.match(/<Tile[\s\S]*?accessibilityLabel=\{`\$\{slot\}[\s\S]*?<\/Tile>/)?.[0] ?? '';
    const statusTile =
      entry.match(
        /<Tile[\s\S]*?accessibilityLabel=\{`\$\{t\('mobile\.plans\.status'\)\}[\s\S]*?<\/Tile>/,
      )?.[0] ?? '';
    expect(
      dateTile,
      'Entry date tile must stay the narrower half because its chip is short',
    ).not.toContain('weight={1.4}');
    expect(
      statusTile,
      'Entry status tile must be the wider half so long badges stay one line',
    ).toContain('weight={1.4}');
    expect(entry, 'Entry status must come from the shared helper').toContain('planEntryStatus');
    expect(entry, 'Entry Hijri caption must share the format eligibility helper').toContain(
      'hijriCaption(locale',
    );
    expect(
      entry,
      'Entry must not show Hijri in English by calling formatHijriDate directly',
    ).not.toContain('formatHijriDate');
    expect(board, 'Plan board status must come from the shared helper').toContain(
      'planEntryStatus',
    );
  });

  it('adds the G12 item history labels in both languages', () => {
    for (const key of [
      'mobile.item.history',
      'mobile.item.historyEmpty',
      'mobile.item.reason.added',
      'mobile.item.reason.consumed',
      'mobile.item.reason.expired',
      'mobile.item.reason.corrected',
      'mobile.item.reason.purchased',
      'mobile.plans.status',
    ]) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }
  });

  it('keeps the credits purchase route on the store purchase path (spec §9.7)', () => {
    const buyCredits = read('screens', 'BuyCreditsScreen.tsx');

    expect(buyCredits).toContain("import { buyCredits } from '../lib/purchase';");
    expect(buyCredits).toContain('<BalanceTile');
    expect(buyCredits).toContain('<LowBalanceNotice');
    expect(buyCredits).toContain('accessibilityRole="radio"');
    expect(buyCredits).toContain(
      'accessibilityState={{ checked: selected, disabled: busyProduct !== null }}',
    );
    expect(buyCredits).toContain('disabled: busyProduct !== null');
    expect(buyCredits).toMatch(
      /style=\{selected \? \{ borderWidth: 2, borderColor: colors\.primary \} : undefined\}/,
    );
    expect(buyCredits).not.toContain('borderWidth: selected ? 2 : undefined');
    expect(buyCredits).not.toContain('borderColor: selected ? colors.primary : undefined');
  });

  it('shares the credits balance tile and renders the balance breakdown (spec §9.7)', () => {
    const buyCredits = read('screens', 'BuyCreditsScreen.tsx');
    const aiUsage = read('app', 'ai-usage.tsx');

    expect(buyCredits).toContain("from '../features/credits/BalanceTile'");
    expect(aiUsage).toContain("from '../features/credits/BalanceTile'");
    expect(buyCredits).toContain("from '../features/credits/LowBalanceNotice'");
    expect(aiUsage).toContain("from '../features/credits/LowBalanceNotice'");
    expect(aiUsage).toContain('<BalanceTile');
    expect(aiUsage).toContain('<LowBalanceNotice');
    expect(aiUsage).toContain('<ListGroup');
    expect(aiUsage.match(/<ListRow/g) ?? []).toHaveLength(2);
    expect(aiUsage).toContain("title={t('mobile.credits.free')}");
    expect(aiUsage).toContain("title={t('mobile.credits.paid')}");
    expect(aiUsage).toContain("t('mobile.credits.resets'");
    expect(aiUsage).toContain("router.push('/buy-credits')");
    expect(aiUsage).not.toContain('useAiUsage');
    expect(aiUsage).not.toContain('spentUsd');
    expect(aiUsage).not.toContain('usage-summary');
  });

  it('keeps sticky footer and toast geometry above the floating tab bar', () => {
    const screen = read('components', 'Screen.tsx');
    const toast = read('components', 'Toast.tsx');
    expect(screen).toContain('tabBar && !hasFooter');
    expect(screen).toContain('onFooterLayout');
    expect(screen).toContain('setToastFooterOffset(event.nativeEvent.layout.height)');
    expect(screen).toContain('<Animated.ScrollView');
    expect(screen).toContain('ReturnType<typeof Animated.event>');
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

    const placeGrid = kitchen.match(/<Bento>[\s\S]*?\{useFirstItems\.length > 0/)?.[0] ?? '';
    expect(placeGrid, 'Kitchen places must keep the lead tile in column one').toContain(
      'renderPlaceTile(places[0], 0, false)',
    );
    expect(placeGrid, 'Kitchen places must stack every non-lead place in column two').toContain(
      'places.slice(1).map((place, index) => renderPlaceTile(place, index + 1, true))',
    );
    expect(
      placeGrid,
      'Kitchen places must not strand places after the stacked column',
    ).not.toContain('places.slice(3)');

    const miniItemCard =
      kitchen.match(/function MiniItemCard[\s\S]*?function SectionHeading/)?.[0] ?? '';
    expect(miniItemCard, 'Kitchen mini item cards must be thin Tile wrappers').toContain('<Tile');
    expect(
      miniItemCard,
      'Kitchen mini item cards must not render hand-styled Pressable cards',
    ).not.toContain('<Pressable');
    expect(
      miniItemCard,
      'Kitchen mini item cards must preserve the three-across width on Tile',
    ).toContain('style={{ width: MINI_CARD_WIDTH }}');
    expect(miniItemCard, 'Kitchen mini item names and status must not truncate').not.toContain(
      'numberOfLines',
    );
    expect(kitchen, 'Kitchen use-first status must use the short visible days-left copy').toContain(
      'formatDaysLeft(t, locale, item.expiresAt, prefs, now)',
    );
    expect(
      kitchen,
      'Kitchen use-first accessibility labels must keep the full expiry sentence',
    ).toContain('accessibilityText: formatExpiryLabel(t, locale, item.expiresAt, prefs, now)');
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

    const useSoonTile =
      home.match(/accessibilityLabel=\{useSoonAccessibilityLabel\}[\s\S]*?<\/Tile>/)?.[0] ?? '';
    expect(useSoonTile, 'Home use-soon row must scroll instead of squeezing mini items').toContain(
      '<ScrollView',
    );
    expect(
      useSoonTile,
      'Home use-soon scroller must remount when direction changes so live en→ar switches do not keep the old physical offset.',
    ).toContain('key={`use-soon-${dir}`}');
    expect(useSoonTile, 'Home use-soon visible statuses must use short days-left copy').toContain(
      'formatDaysLeft(t, locale, item.expiresAt, prefs)',
    );
    expect(useSoonTile, 'Home use-soon mini item names and status must not truncate').not.toContain(
      'numberOfLines',
    );
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
    expect(recipe).toContain('recipeTopBarBacked');
    expect(recipe).toContain('recipeTopBarFadeRange');
    expect(recipe).toContain('const scrollY = useRef(new Animated.Value(0)).current;');
    expect(recipe).toContain('scrollY.interpolate');
    expect(recipe).toContain('inputRange: [topBarFade.start, topBarFade.end]');
    expect(recipe).toContain('Animated.event');
    expect(recipe).toMatch(
      /const handleAnimatedRecipeScroll = useMemo\(\s*\(\) =>\s*Animated\.event\(/,
    );
    expect(recipe).toContain('useNativeDriver: true');
    expect(recipe).toContain('listener: handleRecipeScroll');
    expect(recipe).toContain('pointerEvents="none"');
    expect(recipe).toContain('StyleSheet.hairlineWidth');
    expect(recipe).toContain("tone={barBacked ? 'surface' : 'mediaLight'}");
    expect(recipe).toContain('showLightStatusBar');
    expect(recipe).toContain('!barBacked');
    expect(recipe).not.toContain('heroUnderStatus');
    expect(recipe).toContain('onImageLoad');
    expect(recipe).toContain('onScroll={handleAnimatedRecipeScroll}');
    expect(recipe).toContain('top: insets.top + spacing.md');
    expect(recipe).toContain('<StatusBar style="light" />');
    expect(recipe).not.toContain('Animated.timing');
    expect(recipe).not.toContain('TOP_BAR_FADE_MS');
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
    expect(
      timerControl,
      'The visible running-timer caption is status only; the large numeral carries the countdown.',
    ).toContain("t('mobile.recipe.stepTimerRunningStatus')");
    expect(
      timerControl,
      'The screen-reader label must keep the legacy countdown-inclusive running timer wording.',
    ).toContain("t('mobile.recipe.stepTimerRunning'");
    expect(timerControl).toContain('accessibilityLabel={statusAccessibilityLabel}');
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
      'mobile.recipe.stepTimerRunningStatus',
    ]) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }
  });

  it('keeps Welcome on the Coral full-bleed photo screen contract', () => {
    const welcome = read('app', '(auth)', 'welcome.tsx');

    expect(welcome).toContain('welcome-produce.jpg');
    expect(welcome).toContain('padded={false}');
    expect(welcome).toContain("edges={['bottom', 'left', 'right']}");
    expect(welcome).toContain('<StatusBar style="light"');
    expect(welcome).toContain("t('mobile.welcome.collageLabel')");
    expect(welcome).toContain("t('common.appName')");
    expect(welcome).toContain("t('mobile.welcome.haveAccount')");
    expect(welcome).not.toContain('haveAccountShort');
    expect(welcome).not.toContain('SegmentedControl');
    expect(welcome).not.toContain('surfaceInverse');
    expect(welcome).not.toContain('tagline');
    expect(welcome).toContain('const WELCOME_BODY_GAP = spacing.xl;');
    expect(welcome).toContain('style={{ flexGrow: 1 }}');
    expect(welcome).toContain('variant="hero"');
    expect(welcome).toContain('variant="ghost"');

    for (const key of [
      'common.appName',
      'mobile.welcome.headline',
      'mobile.welcome.headlineAccent',
      'mobile.welcome.subtitle',
      'mobile.welcome.snapTitle',
      'mobile.welcome.snapBody',
      'mobile.welcome.planTitle',
      'mobile.welcome.planBody',
      'mobile.welcome.wasteTitle',
      'mobile.welcome.wasteBody',
      'mobile.welcome.collageLabel',
      'mobile.welcome.collage.tomatoes',
      'mobile.welcome.collage.itemsSpotted',
      'mobile.welcome.getStarted',
      'mobile.welcome.haveAccount',
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
    expect(collage).toContain('ImageBackground');
    expect(collage).toContain('WELCOME_HERO_PHOTO_HEIGHT');
    expect(collage).toContain('function DetectionCorners');
    expect(collage).toContain('variant="numeralSmall"');
    expect(collage).toContain("position: 'absolute'");
    expect(collage).not.toContain('<Bento');
    expect(collage).not.toContain('<Tile');
    expect(collage).not.toContain('OrbMascot');
    expect(collage).not.toContain('tint=');
    expect(collage).not.toContain('colors.accent');
  });

  it('keeps Auth on the Coral welcome and household contracts', () => {
    const layout = read('components', 'AuthLayout.tsx');
    expect(layout).not.toContain('surfaceInverse');
    expect(layout).not.toContain('<OrbMascot');
    expect(layout).toContain('paddingTop: spacing.gutter');
    expect(layout).toContain('<IconButton');
    expect(layout).toContain('tone="plain"');
    expect(layout).toContain('icon="chevL"');
    expect(layout).toContain('variant="display"');
    expect(layout).toContain('titleAccent');
    expect(layout).toContain('leading?: ReactNode');
    expect(layout).toContain('footer?: ReactNode');
    expect(layout).toContain("edges={['top', 'bottom']}");

    const signIn = read('app', '(auth)', 'sign-in.tsx');
    expect(signIn).toContain("t('mobile.auth.signInTitle')");
    expect(signIn).toContain("t('mobile.auth.signInAccent')");
    expect(signIn).toContain("t('mobile.auth.welcomeSubtitle')");

    const signUp = read('app', '(auth)', 'sign-up.tsx');
    expect(signUp).toContain("t('mobile.auth.signUpTitle')");
    expect(signUp).not.toContain("t('mobile.auth.signUpTitle2')");
    expect(signUp).not.toContain("t('mobile.auth.signUpAccent')");

    const onboarding = read('app', '(auth)', 'onboarding.tsx');
    expect(onboarding).toContain('<SegmentedControl<Mode>');
    expect(onboarding).not.toContain('<Chip');
    expect(onboarding).toContain("t('mobile.auth.onboardTitle2')");
    expect(onboarding).toContain("t('mobile.auth.onboardAccent')");
    expect(onboarding).toContain("t('mobile.auth.continue')");
    expect(onboarding).toContain('leading={<HouseholdMark />}');
    expect(onboarding).toContain('footer={');

    const switchLink = read('components', 'AuthSwitchLink.tsx');
    expect(switchLink).toContain('usePressFeedback');
    expect(switchLink).toContain('variant="caption" muted');
    expect(switchLink).toContain('color="primaryText"');
    expect(switchLink).toContain('minHeight: 44');
  });

  it('adds the G11 auth labels in both languages', () => {
    for (const key of [
      'mobile.auth.signInTitle',
      'mobile.auth.signInAccent',
      'mobile.auth.signUpTitle',
      'mobile.auth.signUpTitle2',
      'mobile.auth.signUpAccent',
      'mobile.auth.onboardTitle2',
      'mobile.auth.onboardAccent',
      'mobile.auth.continue',
    ]) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }
  });

  it('keeps Timers on butter tiles with tabular numeral countdowns (spec §9.7)', () => {
    const timers = read('app', 'timers.tsx');
    const runningTile = timers.match(/<Tile[\s\S]*?tint="butter"[\s\S]*?<\/Tile>/)?.[0] ?? '';

    expect(timers, 'Running timers must use the shared Tile primitive').toContain('<Tile');
    expect(timers, 'Running timers should use the butter tint').toContain('tint="butter"');
    expect(
      runningTile,
      'The running timer Tile is one accessibility element, so its visible controls must be exposed through Tile actions.',
    ).toContain('actions={timerActions}');
    expect(timers, 'Countdowns must render through the numeral typography variant').toContain(
      'variant="numeral"',
    );
    expect(timers, 'Timer controls must stay as individually focusable RoundButtons').toContain(
      '<RoundButton',
    );
    expect(
      timers,
      'The timer pause control must not use Icon name "pause", which is the wellness coffee-break glyph.',
    ).not.toMatch(/\bicon\s*(?:=|:)\s*['"]pause['"]/);
    expect(
      timers,
      'The add-minute control must visibly say +1 instead of a bare plus glyph.',
    ).toContain("visibleLabel: '+1'");
    expect(
      timers,
      'The add-minute label must remain the accessible label even though the visible affordance is compact.',
    ).toContain('accessibilityLabel={control.label}');
  });

  it('keeps the smart screen hero on the shared ember Card (spec §9.7)', () => {
    const screen = read('app', 'screen.tsx');
    const heroOpening = screen.slice(
      screen.indexOf('<Card'),
      screen.indexOf('>', screen.indexOf('<Card')) + 1,
    );

    expect(screen, 'Smart screen must render the hero with the shared gradient Card').toMatch(
      /<Card[\s\S]*?\bgradient\b/,
    );
    expect(screen, 'Smart screen must not draw its own gradient outside Card').not.toContain(
      '<LinearGradient',
    );
    expect(screen, 'Smart screen must not read gradientHero outside Card').not.toContain(
      'gradientHero',
    );
    expect(
      screen,
      'The smart screen hero must no longer paint a flat inverse surface',
    ).not.toContain('backgroundColor: colors.surfaceInverse');
    expect(
      heroOpening,
      'The hero container must not be accessible, or its nested buttons can be hidden from assistive tech.',
    ).not.toContain('accessible');
    expect(screen, "The hero's accessibility label must stay on its text group").toContain(
      'accessibilityLabel={`${heroEyebrow}, ${heroMessage}`}',
    );
  });

  it('keeps capture result retake in the fixed trailing icon slot', () => {
    const capture = read('features', 'capture', 'PhotoCapture.tsx');
    const resultTrailing =
      capture.match(/flow === 'result' \? \([\s\S]*?\) : cameraGranted/)?.[0] ?? '';

    expect(resultTrailing).toContain('<RoundButton');
    expect(resultTrailing).toContain("accessibilityLabel={t('mobile.capture.retake')}");
    expect(resultTrailing).not.toContain('<Button');
    expect(resultTrailing).not.toContain("title={t('mobile.capture.retake')}");
  });
});
