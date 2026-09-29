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
  'mobile.screen.entry',
  'mobile.timers.entry',
  'mobile.wellness.entry',
  'mobile.account.kitchenSection',
  'mobile.account.toolsSection',
  'mobile.account.appSection',
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

  it('keeps the Plan surfaces on the Coral agenda contract', () => {
    const plans = read('app', '(tabs)', 'plans.tsx');
    expect(plans).toContain('<DayChipStrip');
    expect(plans).toContain('<PlanTiles');
    expect(plans).toContain('<PlanBoard');
    expect(plans, 'Plans header action migrated off RoundButton').not.toContain('RoundButton');
    expect(plans, 'Plans header must keep the generate action').toContain('<IconButton');
    expect(plans, 'Plans empty state must use the J calendar illustration').toContain(
      'illustration="calendar"',
    );
    expect(plans, 'Plans tab owns B3 job polling').toContain('useJob(activeGeneration?.jobId');
    expect(plans, 'Plans tab clears active generation on success').toContain('finishSuccess()');
    expect(plans, 'Plans tab invalidates plan queries after generation').toContain(
      "invalidateQueries({ queryKey: ['plans'] })",
    );
    expect(plans, 'Plans tab shows the in-tab generating state').toContain('<GeneratingPlanState');
    for (const key of ['plans.daily', 'plans.weekly', 'plans.monthly']) {
      expect(plans, `Plans segmented control must use ${key}`).toContain(`t('${key}')`);
    }
    const weeklyBranch =
      plans.match(/view === 'week'\s*\? \(([\s\S]*?)\)\s*:\s*view === 'day'/)?.[1] ?? '';
    expect(
      weeklyBranch,
      'Plans weekly branch must be explicit so frame order stays guarded',
    ).not.toHaveLength(0);
    expect(
      weeklyBranch.indexOf('<PlanTiles'),
      'Weekly frame order must put progress immediately after the segmented control',
    ).toBeLessThan(weeklyBranch.indexOf('<DayChipStrip'));
    expect(
      weeklyBranch.indexOf('<DayChipStrip'),
      'Weekly frame order must put the day strip before plan-day rows',
    ).toBeLessThan(weeklyBranch.indexOf('<PlanBoard'));

    const tiles = read('features', 'plans', 'PlanTiles.tsx');
    expect(tiles, 'Plan progress is now a J summary block, not legacy Bento tiles').not.toContain(
      '<Bento',
    );
    expect(
      tiles,
      'Plan progress is now a J summary block, not legacy Tile bridge props',
    ).not.toContain('<Tile');
    expect(tiles).toContain('<Stat');
    expect(read('components', 'index.ts')).toContain('export { Stat }');
    expect(tiles).toContain('function PlanShortfallLine');
    expect(tiles).toContain('usePressFeedback()');
    expect(tiles).toContain("'mobile.plans.addToList'");
    expect(tiles).toContain('planCookedStatValue');
    expect(translate('en', 'mobile.plans.cookedCaption' as never)).toBe('cooked');
    expect(tiles).not.toMatch(/\b(tint|fill|compact)=/);
    expect(tiles).not.toContain('icon="warning"');
    for (const key of [
      'mobile.plans.cookedCaption',
      'mobile.plans.toBuyCaption',
      'mobile.plans.addToList',
    ]) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }

    const strip = read('features', 'plans', 'DayChipStrip.tsx');
    expect(strip).toContain('const DAY_CELL_WIDTH = 44');
    expect(strip).toContain('const DAY_CELL_HEIGHT = 60');
    expect(strip).toContain('accessibilityState={{ selected: day.isSelected }}');
    expect(
      strip,
      'Plans day cells own selection; they should not inherit Chip styling',
    ).not.toContain('<Chip');

    const board = read('features', 'plans', 'PlanBoard.tsx');
    expect(board).toContain('function PlanDayRow');
    expect(board).toContain('function MealEntryRow');
    expect(board).toContain('function EmptySlotRow');
    expect(board).toContain('usePressFeedback()');
    expect(board).toContain('planEntryStatus');
    expect(board).toContain('size={56}');
    expect(board).toContain('size={72}');
    expect(board).toContain('minHeight: 80');
    expect(board).toContain('paddingVertical: 4');
    expect(board).toContain('showDate={shouldShowPlanDateColumn');
    expect(board).toContain('<Icon name="check" size={14} color={colors.success} />');
    expect(board).toContain('style={{ color: colors.success, flexShrink: 1 }}');
    expect(board).not.toContain('pressed ?');
    expect(board).not.toContain('<ListGroup');

    const generate = read('app', 'generate-plan.tsx');
    const planGeneration = read('features', 'plans', 'GeneratingPlanState.tsx');
    const planStore = read('stores', 'plan-generation.ts');
    expect(generate, 'Generate plan must retire the orb mascot').not.toContain('<OrbMascot');
    expect(generate, 'Generating moved into the Plans tab by user ruling B3').not.toContain(
      'useJob',
    );
    expect(generate, 'Generate records the plan job in the Plans-tab store').toContain(
      'startGeneration(started.id, scope)',
    );
    expect(generate, 'Generate returns to the Plans tab after the job starts').toContain(
      "router.replace('/plans')",
    );
    expect(generate).toContain('<DateField');
    expect(generate).toContain('<SegmentedControl');
    expect(generate).toContain('<QuantityStepper');
    expect(generate).toContain('footer=');
    expect(planGeneration).toContain('<Illustration name="pot" size={64} />');
    expect(planGeneration).toContain('<Progress');
    expect(planGeneration).toContain('<LoadingState rows={3} compact');
    expect(planGeneration).not.toContain('<Avatar');
    expect(planStore).toContain('finishFailure');
    expect(generate, 'Generate default servings must match the pre-C8 request body').toContain(
      'const [servings, setServings] = useState(2)',
    );
    expect(generate, 'Generate default max cook time must remain omitted').toContain(
      'const [maxCook, setMaxCook] = useState<number | null>(null)',
    );

    const detail = read('app', 'plan', '[id].tsx');
    expect(detail).toContain('variant="shortfall"');
    expect(
      detail.indexOf('<PlanTiles'),
      'Plan detail must render week progress before plan-day rows',
    ).toBeLessThan(detail.indexOf('<PlanBoard'));
    expect(
      detail.indexOf('<PlanBoard'),
      'Plan detail must render the shortfall line after plan-day rows',
    ).toBeLessThan(detail.indexOf('variant="shortfall"'));
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
    expect(row).not.toContain('grouped?:');
  });

  it('keeps Account and Settings on the Coral account contract (spec §9)', () => {
    const account = read('app', 'account.tsx');
    expect(account, 'Account keeps the profile row action').toContain("router.push('/profile')");
    expect(account, 'Account keeps the household row').toContain("'/settings/household'");
    expect(account, 'Account keeps the credits row').toContain("'/ai-usage'");
    expect(account, 'Account keeps the kitchen-screen row').toContain("'/screen'");
    expect(account, 'Account keeps the cooking-timers row').toContain("'/timers'");
    expect(account, 'Account keeps the wellness row').toContain("'/wellness'");
    expect(account, 'Account keeps the notification row').toContain("'/settings/notifications'");
    expect(account, 'Account keeps the settings row').toContain("'/settings'");
    expect(account, 'Account keeps the exact sign-out flow').toContain('resetToSignIn(router)');
    expect(
      account,
      'Account rows should be flat J rows, not deprecated grouped rows',
    ).not.toContain('grouped');
    expect(account).toContain('<AccountHero');
    expect(account).toContain('tone="danger"');

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
    expect(
      settings,
      'Settings rows should be flat J rows, not deprecated grouped rows',
    ).not.toContain('grouped');
    expect(settings, 'Settings keeps the language switch action on screen').toContain(
      'chooseLocale(nextLocale)',
    );
    expect(settings, 'Settings keeps the appearance persistence').toContain('<ThemePicker');
    for (const href of [
      '/settings/notifications',
      '/settings/places',
      '/settings/reminders',
      '/settings/assistant',
      '/settings/feedback',
      '/settings/delete-account',
    ]) {
      expect(settings, `Settings lost ${href}`).toContain(`'${href}'`);
    }

    const deleteAccount = read('app', 'settings', 'delete-account.tsx');
    expect(deleteAccount, 'Delete account must keep the destructive CTA tone').toContain(
      'variant="destructive"',
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
    expect(household, 'Household members should render with J Avatars').toContain('<Avatar');
    expect(household, 'Household must keep the existing Share path for invite codes').toContain(
      'Share.share({ message: household.inviteCode })',
    );
    expect(
      household,
      'Household rows should be flat J rows, not deprecated grouped rows',
    ).not.toContain('grouped');
    const inviteActions =
      household.match(
        /t\('household\.shareInvite'\)[\s\S]*?t\('mobile\.settings\.newInviteCode'\)/,
      )?.[0] ?? '';
    expect(inviteActions, 'Household invite actions should render in order').toContain(
      "t('mobile.settings.newInviteCode')",
    );
    expect(inviteActions, 'Household invite actions should sit in the frame row').toContain(
      "flexDirection: 'row'",
    );
    expect(inviteActions, 'Household invite buttons keep intrinsic width').toContain(
      'fullWidth={false}',
    );
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
    expect(checkbox, 'shopping checkbox touch target width is below 44pt').toContain(
      'width: CHECKBOX_TARGET_SIZE',
    );
    expect(checkbox, 'shopping checkbox touch target height is below 44pt').toContain(
      'height: CHECKBOX_TARGET_SIZE',
    );
    expect(checkboxFile, 'shopping checkbox label should be injected by its row').toContain(
      'accessibilityLabel={label}',
    );
    const row = read('features', 'shop', 'ShoppingRow.tsx');
    expect(row, 'shopping row must pass a sentence label to the checkbox').toContain(
      'accessibilityLabel',
    );
    expect(row, 'J purchased shopping rows dim text without a strike-through').not.toContain(
      'textDecorationLine',
    );
    expect(row, 'J shopping rows use the body tier for item names').toContain('variant="body"');
    expect(row, 'J shopping rows separate with a rowline').toContain(
      'borderBottomColor: colors.rowline',
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
    expect(shopping, 'Shop header action migrated off RoundButton').not.toContain('RoundButton');
    expect(shopping, 'Shop header must keep the share action').toContain('<IconButton');
    expect(shopping, 'Shop empty state must use the J bag illustration').toContain(
      'illustration="bag"',
    );
    expect(shopping, 'Shop content must sit inside the J page gutter').toContain('padded={false}');
    expect(shopping, 'Shop rows are domain rows, not legacy grouped card rows').not.toContain(
      '<ListGroup',
    );
    expect(shopping, 'Shop must render the frame To buy group label').toContain(
      "t('mobile.home.statShopping')",
    );
    expect(shopping, 'Shop To buy label must include the unpurchased count').toContain(
      'unpurchasedCountText',
    );
  });

  it('keeps Capture and Review on the Coral confirmation contract (spec §9.7)', () => {
    const capture = read('app', 'capture', 'index.tsx');
    const chrome = read('features', 'capture', 'CaptureChrome.tsx');
    const photo = read('features', 'capture', 'PhotoCapture.tsx');
    const pins = read('features', 'capture', 'ArPins.tsx');
    const review = read('features', 'capture', 'ReviewList.tsx');
    const row = read('features', 'capture', 'ReviewTile.tsx');

    expect(capture).toContain('<CapturePageHeader');
    expect(chrome).toContain('CAPTURE_METHOD_OPTIONS');
    expect(chrome).toContain("value: 'manual'");
    expect(chrome).toContain('export function CaptureModeTabs');
    expect(chrome).not.toContain('<SegmentedControl');
    expect(photo).toContain('colors.surfaceInverseAlt');
    expect(photo).toContain("setSession(session, 'photo', zipPhotos(photos, keys))");
    expect(photo).toContain("setSession(session, 'receipt')");
    expect(photo).toContain(
      'buildInventoryInputs(initialReviewRows(session, locations.data ?? [])',
    );
    expect(pins).toContain('DETECTION_CORNER_LENGTH = 18');
    expect(pins).toContain('DETECTION_TAG_HEIGHT = 22');
    expect(review).toContain('orderedReviewRows');
    expect(review).toContain("t('mobile.review.hint')");
    expect(review).toContain('ReviewFooter');
    expect(review).toContain("const rowVariant = source === 'assistant' ? 'rich' : 'flat'");
    expect(row).toContain('showQuantityStepper');
    expect(row).toContain('borderBottomColor: colors.rowline');
    expect(row).not.toContain('<Tile');
    expect(review).not.toContain('<Bento');
  });

  it('keeps Item detail on the append-only event-ledger contract (spec §9.7)', () => {
    const item = read('app', 'item', '[id].tsx');
    const productReview = read('features', 'inventory', 'ProductReview.tsx');

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
    const updateBody = item.match(/update\.mutate\(\s*\{([\s\S]*?)\}\s*,\s*\{/);
    expect(updateBody, 'Item detail must keep one updateInventoryItem save body').not.toBeNull();
    expect(
      updateBody?.[1] ?? '',
      'Quantity must remain an append-only event and never enter the updateInventoryItem body',
    ).not.toContain('quantity');
    expect(item, 'J item detail keeps the pencil as the nav trailing action').toMatch(
      /<Header[\s\S]*?trailing=\{[\s\S]*?<IconButton[\s\S]*?icon="pencil"/,
    );
    expect(item, 'J item detail renders fact rows, not the old Bento mini tiles').not.toContain(
      '<Bento',
    );
    expect(item, 'J item detail renders fact rows, not shared Tile mini cards').not.toContain(
      '<Tile',
    );
    expect(item, 'Quantity stays editable inline on the page').toContain('<QuantityStepper');
    expect(item, 'Item detail keeps the visible unit beside the numeric stepper').toContain(
      'const quantityUnitText = unitLabel(t, item.unit);',
    );
    expect(item, 'Item detail keeps the visible unit beside the numeric stepper').toContain(
      '{quantityUnitText}',
    );
    expect(item, 'Item footer keeps the remove action visible outside the edit sheet').toContain(
      "title={t('inventory.deleteItem')}",
    );
    expect(item, 'C7 screens must migrate off deprecated Button danger aliases').not.toContain(
      'variant="danger"',
    );
    expect(item, 'History loading must use the shared compact LoadingState').toContain(
      '<LoadingState compact',
    );
    expect(item, 'History errors must use the shared compact ErrorState').toMatch(
      /<ErrorState[\s\S]*?\bcompact\b/,
    );
    expect(item, 'Product review stays on the item page below History').toContain('<ProductReview');
    expect(productReview, 'ProductReview is the J inline rate block, not a card').not.toContain(
      '<Card',
    );
    expect(productReview).toContain('<StarRating');
    expect(productReview).toContain('<Field');
    expect(productReview, 'Review submission uses the J secondary outline button').toContain(
      'variant="secondary"',
    );
    expect(productReview, 'The privacy caption remains visible').toContain(
      "t('mobile.productReview.vendorNote')",
    );
  });

  it('keeps Settings places on the Coral place-row contract', () => {
    const places = read('app', 'settings', 'places.tsx');

    expect(places).toContain("t('mobile.places.entryHint')");
    expect(places, 'Place rows must render J place drawings').toContain('<Illustration');
    expect(places, 'Place rows and move sheet must share the Home place art mapping').toContain(
      'placeIllustration(',
    );
    expect(
      places,
      'Rename and remove controls are icon buttons in the row trailing area',
    ).toContain('<IconButton');
    expect(places, 'C7 must move places off deprecated grouped rows').not.toContain('grouped');
    expect(places, 'C7 must move places off generic location glyph rows').not.toContain(
      'icon="location"',
    );
    expect(places, 'Occupied removal must still ask for a move destination').toContain(
      "t('mobile.places.moveTitle')",
    );
    expect(places, 'Move rows keep the destructive move-and-remove label').toContain(
      "t('mobile.places.moveHere')",
    );
    expect(
      places,
      'Move rows must render the destructive move-and-remove subtitle in danger text',
    ).toContain('function MoveDestinationSubtitle');
    expect(
      places,
      'Move rows must not rely on ListRow muted subtitle styling for the destructive action',
    ).toContain('style={{ color: colors.danger }}');
  });

  it('keeps Entry detail on the Coral meal-sheet route contract (spec §9.7)', () => {
    const entry = read('app', 'entry', '[id].tsx');
    const board = read('features', 'plans', 'PlanBoard.tsx');

    expect(
      entry,
      'Entry detail is now the J meal-sheet layout, not the old Bento mini tiles',
    ).not.toContain('<Bento');
    expect(
      entry,
      'Entry detail is now the J meal-sheet layout, not shared Tile mini cards',
    ).not.toContain('<Tile');
    expect(entry).toContain('<SegmentedControl');
    expect(entry).toContain('value={entry.state}');
    expect(entry).toContain('usePlanCoverage');
    expect(entry).toContain('planEntryHaveBadge');
    expect(entry).not.toContain("entry.fullyCovered ? t('mobile.home.allInKitchen') : statusLabel");
    expect(entry).toContain("value: 'planned'");
    expect(entry).toContain("value: 'cooked'");
    expect(entry).toContain("value: 'skipped'");
    expect(entry).toContain("t('mobile.plans.keepMeal')");
    expect(entry).toContain("t('mobile.plans.changeMeal')");
    expect(entry, 'Entry recipe row must keep the recipe detail route').toContain(
      'router.push(`/recipe/${recipe.id}`)',
    );
    expect(
      entry,
      'B4 removes the secondary cook-mode footer action from the meal sheet',
    ).not.toContain('router.push(`/recipe/${recipe.id}/cook`)');
    expect(entry).not.toContain('<QuantityStepper');
    expect(entry).not.toContain("t('mobile.recipe.startCooking')");
    expect(entry, 'Entry status title must be a stable label, not badge copy').toContain(
      "t('mobile.plans.status')",
    );
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
    const packCard = read('features', 'credits', 'CreditPackCard.tsx');

    expect(buyCredits).toContain("import { buyCredits } from '../lib/purchase';");
    expect(buyCredits).toContain('<BalanceTile');
    expect(buyCredits).toContain('<LowBalanceNotice');
    expect(buyCredits).toContain('<CreditPackCard');
    expect(buyCredits).toContain('onBuy={(productId) => void onBuy(productId)}');
    expect(buyCredits).toContain('busyProduct === pack.productId');
    expect(buyCredits).toContain('disabled={busyProduct !== null}');
    expect(buyCredits).not.toContain('<Bento');
    expect(buyCredits).not.toContain('<Tile');
    expect(packCard).toContain('pack.productId');
    expect(packCard).toContain('CREDIT_PACK_ILLUSTRATION_SIZE = 56');
    expect(packCard).toContain('<Button');
    expect(packCard).toContain("t('mobile.credits.packSubtitle'");
    expect(packCard).not.toContain('accessibilityRole="radio"');
  });

  it('opens the out-of-credits sheet from generate plan without changing the footer action', () => {
    const generate = read('app', 'generate-plan.tsx');
    const panel = read('features', 'credits', 'OutOfCreditsPanel.tsx');

    expect(generate).toContain('const [creditsSheetOpen, setCreditsSheetOpen] = useState(false);');
    expect(generate).toContain('setCreditsSheetOpen(true);');
    expect(generate).toContain("title={t('mobile.plans.generateCta')}");
    expect(generate).not.toContain("affordable ? t('mobile.plans.generateCta')");
    expect(generate).toContain('visible={creditsSheetOpen}');
    expect(generate).toContain("title={t('mobile.credits.outOfCreditsTitle')}");
    expect(generate).toContain('<OutOfCreditsPanel');
    expect(generate).toContain('onGetMore={goBuyCredits}');
    expect(generate).toContain('router.push(`/buy-credits?action=${action}`)');
    expect(panel).toContain('onGetMore');
    expect(panel).toContain("t('mobile.credits.getMore')");
  });

  it('keeps Assistant on the Coral text, voice, live and review contracts', () => {
    const route = read('app', 'assistant.tsx');
    const screen = read('features', 'assistant', 'LiveAssistantScreen.tsx');
    const header = read('features', 'assistant', 'AssistantHeader.tsx');
    const composer = read('features', 'assistant', 'Composer.tsx');
    const modeSheet = read('features', 'assistant', 'ModeSheet.tsx');
    const bubble = read('features', 'assistant', 'Bubble.tsx');

    expect(route).toContain('initialMode={assistantModeFromParam(params.mode)}');
    expect(header).toContain('<Avatar');
    expect(header).toContain('assistantHeaderAccessibilityLabel');
    expect(header).not.toContain('OrbMascot');
    expect(header).not.toContain('RoundButton');
    expect(header).not.toContain('tintNamed');

    expect(screen).toContain('const demoBanner =');
    expect(screen).toContain('isMock && !isLiveSurface ?');
    expect(screen).toContain('{demoBanner}');
    expect(screen.indexOf('{demoBanner}')).toBeLessThan(
      screen.indexOf("mode === 'live' && !cameraReady"),
    );
    expect(screen).toContain('function AssistantStarterPrompt');
    expect(screen).toContain('function VoiceAssistantPanel');
    expect(screen).toContain('function DetectionOverlay');
    expect(screen).toContain('function SessionPausedOverlay');
    expect(screen).toContain('<ReviewList');
    expect(screen).toContain('source="assistant"');
    expect(screen).toContain('detectionsToSession(detections)');
    expect(screen).toContain('create.mutate');
    expect(screen).not.toContain('useAdjustQuantity');
    expect(screen).not.toContain('<Chip');
    expect(screen).not.toContain('RecipeThumb');

    expect(composer).toContain('borderTopColor: colors.rowline');
    expect(composer).toContain('backgroundColor: colors.surfaceAlt');
    expect(composer).toContain('icon="sliders"');
    expect(composer).not.toContain('RoundButton');

    expect(modeSheet).toContain('<ListRow');
    expect(modeSheet).toContain('assistantModeAccessibilityLabel');
    expect(modeSheet).not.toContain('<SegmentedControl');
    expect(modeSheet).not.toContain('<ToggleRow');

    expect(bubble).toContain('maxWidth: 290');
    expect(bubble).toContain('backgroundColor: mine ? colors.inverse : colors.surfaceAlt');
    expect(bubble).not.toContain('OrbMascot');
  });

  it('shares the credits balance tile and renders the balance plus usage breakdown (spec §9.7)', () => {
    const buyCredits = read('screens', 'BuyCreditsScreen.tsx');
    const aiUsage = read('app', 'ai-usage.tsx');
    const usageSummary = read('features', 'credits', 'UsageSummary.tsx');
    const balanceTile = read('features', 'credits', 'BalanceTile.tsx');

    expect(buyCredits).toContain("from '../features/credits/BalanceTile'");
    expect(aiUsage).toContain("from '../features/credits/BalanceTile'");
    expect(buyCredits).toContain("from '../features/credits/LowBalanceNotice'");
    expect(aiUsage).toContain("from '../features/credits/LowBalanceNotice'");
    expect(aiUsage).toContain('<BalanceTile');
    expect(aiUsage).toContain('<LowBalanceNotice');
    expect(aiUsage).toContain('useAiUsage');
    expect(aiUsage).toContain('<UsageSummary');
    expect(aiUsage).toContain('footer={');
    expect(aiUsage).toContain("title={t('mobile.credits.buy')}");
    expect(aiUsage).toContain('<ListGroup');
    expect(aiUsage.match(/<ListRow/g) ?? []).toHaveLength(2);
    expect(aiUsage).toContain("title={t('mobile.credits.free')}");
    expect(aiUsage).toContain("title={t('mobile.credits.paid')}");
    expect(aiUsage).toContain("t('mobile.credits.resets'");
    expect(aiUsage).toContain("router.push('/buy-credits')");
    expect(usageSummary).toContain('usageCreditsFromUsd');
    expect(usageSummary).toContain('<Progress');
    expect(usageSummary).toContain("t('mobile.aiUsage.spentOfBudget'");
    expect(usageSummary).toContain('variant="numeral"');
    expect(usageSummary).toContain("t('mobile.aiUsage.callsCount'");
    expect(balanceTile).toContain('accessible');
    expect(balanceTile).toContain('creditBalanceAccessibilityLabel');
    expect(balanceTile).toContain('accessibilityLabel={accessibilityLabel}');
    expect(aiUsage).not.toContain('spentUsd');
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
    expect(addField, 'Shop add button migrated off RoundButton').not.toContain('RoundButton');
    expect(addField, 'Shop add action uses the J inverse IconButton').toContain('<IconButton');
    expect(addField).toContain('tone="inverse"');
    expect(addField, 'Shop add field uses the frame surfaceAlt fill').toContain(
      'backgroundColor: colors.surfaceAlt',
    );
    expect(addField, 'Shop add field must stay square').toContain('borderRadius: radius.none');
    expect(addField, 'Shop suggestion rows use animated press feedback').toContain(
      'usePressFeedback()',
    );
    expect(addField, 'Shop suggestion rows must not switch style on pressed').not.toContain(
      'pressed ?',
    );
  });

  it('keeps Kitchen wired to the Coral screen contract', () => {
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
    expect(kitchen, 'Kitchen header action migrated off RoundButton').not.toContain('RoundButton');
    expect(kitchen, 'Kitchen header must keep the add action').toContain('<IconButton');
    expect(kitchen, 'Kitchen vertical rhythm must use the compact Figma stack gap').toContain(
      'KITCHEN_TOP_STACK_GAP = spacing.md',
    );
    expect(kitchen, 'Kitchen fridge view must not inherit overview-only vertical gaps').toContain(
      'gap: selectedLocation ? 0 : KITCHEN_TOP_STACK_GAP',
    );
    expect(kitchen, 'Kitchen chips must remove extra vertical padding').not.toContain(
      'paddingVertical: spacing.xs',
    );
    expect(
      read('components', 'TabHeader.tsx'),
      'TabHeader owns the account affordance for every tab',
    ).toContain('<AccountButton');
    expect(kitchen, 'Kitchen must not duplicate the TabHeader account affordance').not.toContain(
      '<AccountButton',
    );
    expect(kitchen, 'J search is the 44pt SearchField below the header').toContain('<SearchField');

    const placeTile = kitchen.match(/function PlaceTile[\s\S]*?function SortSheet/)?.[0] ?? '';
    const placeGrid = kitchen.match(/<Bento[\s\S]*?\{useFirstItems\.length > 0/)?.[0] ?? '';
    expect(placeGrid, 'Kitchen places must use the J two-column tile primitive').toContain(
      'variant="tiles"',
    );
    expect(placeTile, 'Kitchen place tiles must be J place tiles').toContain('variant="place"');
    expect(placeTile, 'Kitchen place tiles must share the Home place art mapping').toContain(
      'placeIllustration(ranked.location.type)',
    );
    const placeChipStart = kitchen.indexOf('{places.map((place) => (');
    const placeChipEnd = kitchen.indexOf('{places.length > 0 ?', placeChipStart);
    const placeChips =
      placeChipStart >= 0 && placeChipEnd > placeChipStart
        ? kitchen.slice(placeChipStart, placeChipEnd)
        : '';
    expect(placeChips, 'Place chips keep only labels; All is the only counted chip').not.toContain(
      'count={place.count}',
    );
    expect(placeChips, 'Place chips must still announce item and soon counts').toContain(
      'accessibilityLabel={placeAccessibilityLabel',
    );
    expect(kitchen, 'Use-first trailing action must open the Sort sheet').toContain(
      "actionLabel={selectedLocation ? undefined : t('mobile.kitchen.sortAction')}",
    );
    expect(kitchen, 'Use-first action must no longer scroll to All items').not.toContain(
      'seeAllUseFirst',
    );
    expect(
      placeGrid,
      'Kitchen place tiles must not use deprecated tint/fill/compact bridge props',
    ).not.toMatch(/\b(tint|fill|compact)=/);

    expect(kitchen, 'Use-first and all-items rows must reuse the shared item row').toContain(
      '<InventoryItemRow',
    );
    expect(kitchen, 'Kitchen item rows must use the generalized metadata helper').toContain(
      'inventoryItemRowMeta(t, locale, item,',
    );
    expect(kitchen, 'Kitchen item rows must use the generalized timing helper').toContain(
      'inventoryItemRowWhen(t, locale, item, prefs, now)',
    );
    expect(kitchen, 'Kitchen item rows must use the generalized badge helper').toContain(
      'inventoryItemRowBadge(t, item, now)',
    );
    expect(kitchen, 'Kitchen item rows must use the shared food-art helper').toContain(
      'inventoryItemRowFoodIcon(item)',
    );
    expect(kitchen, 'Kitchen use-first status must use the short visible days-left copy').toContain(
      'inventoryItemRowWhen(t, locale, item, prefs, now)',
    );
    expect(
      kitchen,
      'Kitchen use-first accessibility labels must keep the full expiry sentence',
    ).toContain('formatExpiryLabel(t, locale, item.expiresAt, prefs, now)');
  });

  it('keeps Home on the Coral dashboard contract', () => {
    const home = read('app', '(tabs)', 'home.tsx');
    const assistantSearch = read('features', 'home', 'AssistantSearchButton.tsx');
    const assistantShortcuts = read('features', 'home', 'AssistantModeShortcuts.tsx');
    const tonightCard = read('features', 'home', 'TonightRecipeCard.tsx');
    const noPlanCard = read('features', 'home', 'NoPlanCard.tsx');
    const quickActions = read('features', 'home', 'QuickActions.tsx');
    const useSoonSection = read('features', 'home', 'UseSoonSection.tsx');
    const weekSection = read('features', 'home', 'WeekSection.tsx');
    const kitchenGlance = read('features', 'home', 'KitchenGlance.tsx');
    const inventoryRow = read('features', 'inventory', 'InventoryItemRow.tsx');
    const homeOwned = [
      home,
      assistantSearch,
      assistantShortcuts,
      tonightCard,
      noPlanCard,
      quickActions,
      useSoonSection,
      weekSection,
      kitchenGlance,
      inventoryRow,
    ].join('\n');

    expect(home).toContain('padded={false}');
    expect(home).toContain('<TabHeader');
    expect(home).toContain('icon="bell"');
    expect(home).toContain("router.push('/settings/notifications')");
    expect(home).toContain('<AssistantSearchButton');
    expect(assistantSearch).toContain('usePressFeedback()');
    expect(assistantSearch, 'Home assistant search uses the chat glyph from the frame').toContain(
      'name="chat"',
    );
    expect(assistantSearch, 'Home assistant search must not use a magnifier glyph').not.toContain(
      'name="search"',
    );
    expect(home, 'Home greeting is one ink title, not a coral-accent name').toContain(
      'const greetingTitle = greetingName',
    );
    expect(home, 'Home must not pass the greeting name through the accent slot').not.toContain(
      'titleAccent={greetingName',
    );
    expect(home).toContain("router.push('/assistant')");
    expect(home, 'Home must keep labelled chat/voice/live assistant shortcuts').toContain(
      '<AssistantModeShortcuts',
    );
    expect(home).toContain('router.push(`/assistant?mode=${mode}`)');
    for (const mode of ["mode: 'text'", "mode: 'voice'", "mode: 'live'"]) {
      expect(assistantShortcuts).toContain(mode);
    }
    expect(assistantSearch).not.toContain('<SearchField');
    expect(homeOwned).not.toContain('<OrbMascot');
    expect(homeOwned).not.toContain('<RoundButton');
    expect(homeOwned).not.toContain('tint=');
    expect(homeOwned).not.toContain('tintNamed');
    expect(homeOwned).not.toContain('radius.pill');
    expect(homeOwned).not.toContain('pressed ?');
    expect(homeOwned).not.toContain('transform: [{ scale');
    expect(home).not.toContain('StatTiles');
    expect(existsSync(join(SRC, 'features', 'home', 'StatTiles.tsx'))).toBe(false);
    expect(existsSync(join(SRC, 'features', 'home', 'KitchenGlance.tsx'))).toBe(true);
    for (const inlineComponent of [
      'function AssistantSearchButton',
      'function TonightRecipeCard',
      'function NoPlanCard',
      'function QuickActions',
      'function UseSoonSection',
      'function WeekSection',
      'function PlaceTile',
      'function KitchenGlanceSection',
    ]) {
      expect(home, `Home route still owns ${inlineComponent}`).not.toContain(inlineComponent);
    }

    for (const route of [
      '/recipe/',
      '/cook',
      '/kitchen',
      '/assistant',
      '/buy-credits',
      '/capture?method=receipt',
      '/capture?method=manual',
      '/generate-plan',
      '/plans',
    ]) {
      expect(home, `Home no longer routes to ${route}`).toContain(route);
    }

    expect(tonightCard, 'Tonight recipe must keep the recipe detail route').toContain(
      'onOpenRecipe',
    );
    expect(tonightCard, 'Tonight recipe must keep cook-mode navigation').toContain('onCookRecipe');
    expect(tonightCard, 'Watch how must open the videos, not the recipe top').toContain(
      'onPress={onWatchRecipe}',
    );
    expect(home, 'Watch how must deep-link to the videos tab').toContain(
      'router.push(`/recipe/${recipeId}?tab=videos`)',
    );
    expect(
      read('app', 'recipe', '[id]', 'index.tsx'),
      'Recipe reset must honour the requested tab, not force the ingredients',
    ).not.toContain("setSegment('ingredients')");
    expect(tonightCard, 'Tonight recipe must use the J full-bleed recipe photo').toContain(
      'size={196}',
    );
    for (const [name, value] of [
      ['RECIPE_CARD_BODY_PADDING_TOP', 16],
      ['RECIPE_CARD_BODY_PADDING_HORIZONTAL', 16],
      ['RECIPE_CARD_BODY_PADDING_BOTTOM', 18],
      ['RECIPE_CARD_BODY_GAP', 6],
      ['RECIPE_CARD_ACTIONS_PADDING_TOP', 10],
    ]) {
      expect(tonightCard, `Tonight recipe ${name} drifted from spec §8`).toContain(
        `const ${name} = ${value}`,
      );
    }
    expect(tonightCard).toContain('paddingTop: RECIPE_CARD_BODY_PADDING_TOP');
    expect(tonightCard).toContain('paddingHorizontal: RECIPE_CARD_BODY_PADDING_HORIZONTAL');
    expect(tonightCard).toContain('paddingBottom: RECIPE_CARD_BODY_PADDING_BOTTOM');
    expect(tonightCard).toContain('gap: RECIPE_CARD_BODY_GAP');
    expect(tonightCard).toContain('paddingTop: RECIPE_CARD_ACTIONS_PADDING_TOP');
    expect(tonightCard, 'Tonight recipe actions must be compact J buttons').toContain('size="S"');

    expect(noPlanCard, 'No-plan state must use the J calendar EmptyState').toContain(
      'illustration="calendar"',
    );
    expect(noPlanCard, 'No-plan action must be a compact primary action').toContain('size="S"');
    expect(noPlanCard, 'No-plan card must show the plan-generation credit cost').toContain(
      "costOf('plan.daily')",
    );

    expect(quickActions).toContain('variant="quickAction"');
    expect(quickActions.match(/\bcount=\{/g) ?? []).toHaveLength(3);
    expect(
      quickActions,
      'Quick actions must use caption labels, not bodyStrong overrides',
    ).not.toContain('variant="bodyStrong"');
    expect(quickActions, 'Quick actions should let Tile render the caption tier').not.toContain(
      '<AppText',
    );

    expect(
      useSoonSection,
      'Home use-soon rows must be J item rows, not a squeezed scroller',
    ).not.toContain('<ScrollView');
    expect(useSoonSection, 'Home use-soon rows keep the direction remount guard').toContain(
      'key={`use-soon-${dir}`}',
    );
    expect(
      useSoonSection,
      'Home use-soon visible statuses must use short days-left copy',
    ).toContain('inventoryItemRowWhen(t, locale, item, prefs)');
    expect(useSoonSection, 'Home use-soon rows must render the shared inventory row').toContain(
      '<InventoryItemRow',
    );
    expect(inventoryRow, 'Item rows must keep spec §8 vertical padding').toContain(
      'paddingVertical: 10',
    );
    expect(inventoryRow, 'Item rows must keep spec §8 gap').toContain('gap: 14');
    expect(inventoryRow, 'Item rows must keep the flat rowline').toContain(
      'borderBottomColor: colors.rowline',
    );
    expect(inventoryRow, 'Home use-soon item rows must show food art at the J row size').toContain(
      'size={56}',
    );
    expect(inventoryRow, 'Item rows must keep the bodyStrong name').toContain(
      'variant="bodyStrong"',
    );
    expect(inventoryRow, 'Item rows must keep the caption meta line').toContain(
      'variant="caption"',
    );
    expect(useSoonSection, 'Home use-soon metadata must keep quantity and location').toContain(
      'inventoryItemRowMeta(t, locale, item, { location, prefs })',
    );
    expect(
      useSoonSection,
      'Home use-soon section must not render the extra count caption after the rows',
    ).not.toContain('countLabel');
    expect(inventoryRow, 'Home use-soon rows must use worded status badges').toContain('<Badge');

    expect(weekSection, 'Home week block must be the J Progress plus day strip').toContain(
      '<Progress',
    );
    expect(weekSection, 'Home week block must render the owned WeekStrip').toContain('<WeekStrip');

    expect(kitchenGlance, 'Home glance must rank real household places').toContain('rankPlaces');
    expect(kitchenGlance, 'Home glance must render J place tiles').toContain('variant="place"');
    expect(home, 'Home glance must keep the full kitchen route').toContain(
      "router.push('/kitchen')",
    );
  });

  it('keeps the Home cook action as a recipe action, not a mirrored direction glyph', () => {
    const home = read('app', '(tabs)', 'home.tsx');
    expect(home).toContain('router.push(`/recipe/${recipeId}/cook`)');
    expect(home).toContain('onCookRecipe={() => cookRecipe(tonight.recipe.id)}');
    expect(home).not.toContain('<DirectionalIcon name="play"');
  });

  it('keeps the empty Tonight state at the populated Tonight card height', () => {
    const noPlanCard = read('features', 'home', 'NoPlanCard.tsx');
    expect(noPlanCard).toMatch(
      /NO_PLAN_CARD_MIN_HEIGHT\s*=\s*270[\s\S]*?function NoPlanCard[\s\S]*?minHeight:\s*NO_PLAN_CARD_MIN_HEIGHT/,
    );
  });

  it('keeps Recipe on the Coral J screen contract', () => {
    const recipe = read('app', 'recipe', '[id]', 'index.tsx');
    const ingredientRow = read('features', 'recipe', 'RecipeIngredientRow.tsx');
    const videoCard = read('features', 'recipe', 'RecipeVideoCard.tsx');

    expect(recipe).toContain('<RecipeThumb');
    expect(recipe).toContain('const HERO_HEIGHT = 280');
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
    expect(recipe).toContain("pointerEvents={barBacked ? 'none' : 'auto'}");
    expect(recipe).toContain("pointerEvents={barBacked ? 'auto' : 'none'}");
    expect(recipe).toContain('borderBottomWidth: 1');
    expect(recipe).toContain('tone="plain"');
    expect(recipe).toContain('tone="media"');
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
    expect(ingredientRow).toContain('scaleQuantityForServings');
    expect(recipe).toContain('<SegmentedControl');
    expect(recipe).toContain("value: 'videos'");
    expect(recipe).toContain("segment === 'steps'");
    expect(recipe).toContain("segment === 'videos'");
    expect(videoCard).toContain('<YoutubePlayer');
    expect(videoCard).toContain('formatRecipeVideoDuration');
    expect(videoCard).toContain('thumbnailOverlay={');
    expect(videoCard).toContain('backgroundColor: colors.surfaceInverse');
    expect(recipe).toContain('<RecipeMetaRow');
    expect(recipe).toContain('<RecipeIngredientRow');
    expect(recipe).toContain('<RecipeStepRow');
    expect(recipe).toContain('<RecipeCookedSheetContent');
    expect(recipe).toContain('<QuantityStepper');
    expect(recipe).toContain('visible={servingsSheetOpen}');
    expect(recipe).toContain("t('mobile.recipe.servingsOpenLabel'");
    expect(recipe).toContain("t('mobile.recipe.servingsOpenHint')");
    expect(recipe).toContain("t('recipe.markCooked')");
    expect(recipe).toContain("t('mobile.recipe.startCooking')");
    expect(recipe).toContain('mobile.recipe.minutesValue');
    expect(recipe).toContain('mobile.recipe.prepLabel');
    expect(recipe).toContain('mobile.recipe.cookLabel');
    expect(recipe).toContain('DIFFICULTY_KEY');
    expect(recipe).not.toContain('RoundButton');
    expect(recipe).not.toContain('<Tile');
    expect(recipe).not.toContain('<ListGroup');
    expect(recipe).not.toContain('<ListRow');
    expect(recipe).not.toContain('tintNamed');
    expect(recipe).not.toMatch(/heart/i);
  });

  it('keeps Cook on the Coral J always-dark screen contract', () => {
    const cook = read('app', 'recipe', '[id]', 'cook.tsx');
    const timerControl = read('features', 'recipe', 'CookTimerPanel.tsx');

    expect(cook).toMatch(
      /export default function CookMode\(\) \{\s*return \(\s*<ThemeModeOverride mode="dark">[\s\S]*?<StatusBar style="light" \/>[\s\S]*?<CookModeContent \/>[\s\S]*?<\/ThemeModeOverride>/,
    );
    expect(cook).toContain('useKeepAwake()');
    expect(cook).toContain("direction: 'ltr'");
    expect(cook).toContain('<Progress');
    expect(cook).toContain(
      'accessibilityValue={{ min: 0, max: total, now: step + 1, text: progressLabel }}',
    );
    expect(timerControl).toContain("t('mobile.recipe.stepTimerProgress')");
    expect(timerControl).toContain('accessibilityLabel={progressLabel}');
    expect(timerControl).not.toContain('accessibilityValue={{ min: 0, max: 100');
    expect(cook).toContain('<IconButton');
    expect(cook).toContain('icon="chat"');
    expect(cook).toContain('useUpdateTimer()');
    expect(cook).toContain(
      'onAction={(timerId, body) => updateTimer.mutate({ id: timerId, body })}',
    );
    expect(cook).not.toContain('<OrbMascot');
    expect(cook).not.toContain('RoundButton');
    expect(cook).toContain('stepIngredients(');
    expect(cook).toContain('parseServingsParam');
    expect(cook).toContain('projectTimer(existing, now)');
    expect(cook).toContain('initialMode="voice"');
    expect(cook).toContain('lockMode');
    expect(cook).toContain("backgroundColor: 'transparent'");

    expect(timerControl).toContain('<Button');
    expect(timerControl).toContain('variant="numeralSmall"');
    expect(timerControl).toContain('variant="caption"');
    expect(timerControl).toContain('cookTimerControls(projected)');
    expect(timerControl).toContain('icon="x"');
    expect(timerControl).toContain('action: pauseResumeAction');
    expect(timerControl).toContain("onAction(projected.id, { action: 'stop' })");
    expect(timerControl).not.toMatch(/\n\s+accessible\b/);
    expect(timerControl).not.toContain('accessibilityLabel={caption}');
    expect(
      timerControl,
      'The visible running-timer caption is the timer name; the large numeral carries the countdown.',
    ).toContain('projected.label');
    expect(
      timerControl,
      'The screen-reader label must keep the legacy countdown-inclusive running timer wording.',
    ).toContain("t('mobile.recipe.stepTimerRunning'");
    expect(timerControl).toContain('accessibilityLabel={statusAccessibilityLabel}');
    expect(timerControl).not.toContain('tintNamed');
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
    expect(welcome).toContain("t('mobile.welcome.photoLabel')");
    expect(welcome).toContain("t('common.appName')");
    expect(welcome).toContain("t('mobile.welcome.haveAccount')");
    expect(welcome).toContain('const LOCALES = [');
    expect(welcome).toContain('setLocale');
    expect(welcome).toContain('localeToggle');
    expect(welcome).toContain('size="S"');
    expect(welcome).toContain("t('mobile.welcome.switchLanguageTo'");
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
      'mobile.welcome.photoLabel',
      'mobile.welcome.collage.tomatoes',
      'mobile.welcome.collage.itemsSpotted',
      'mobile.welcome.getStarted',
      'mobile.welcome.haveAccount',
      'mobile.welcome.switchLanguageTo',
    ]) {
      expect(isMessageKey(key), `${key} is missing from the catalog`).toBe(true);
      expect(translate('ar', key as never)).not.toBe(translate('en', key as never));
    }

    for (const file of ['welcome-produce.jpg']) {
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
    expect(signUp).toContain(
      "accessibilityLabel={`${t(key)}, ${t('mobile.auth.passwordRuleUnmet')}`}",
    );
    expect(signUp).toContain('<Icon name="x" size={14} color={colors.danger} />');
    expect(signUp).not.toContain('✕');

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

  it('keeps Timers on the Coral timer-card and new-timer sheet contract (spec §9)', () => {
    const timers = read('app', 'timers.tsx');
    const timerCard = read('features', 'timers', 'TimerCard.tsx');
    const newTimerSheet = read('features', 'timers', 'NewTimerSheet.tsx');

    expect(timers).toContain('<NewTimerSheet');
    expect(timers).toContain(
      'ordered.length === 0 && !timersQuery.isLoading && !timersQuery.isError',
    );
    expect(timers).toContain("actionLabel={t('mobile.timers.newTimer')}");
    expect(timers).not.toContain('showFooter');
    expect(timers).toContain('illustration="timer"');
    expect(timers).not.toContain('<Tile');
    expect(timers).not.toContain('RoundButton');
    expect(timers).not.toMatch(/\b(tint|fill|compact)=/);
    expect(timerCard).toContain('<Progress');
    expect(timerCard).toContain('timerProgressValue');
    expect(timerCard).toContain('variant="numeralSmall"');
    expect(timerCard).toContain('<IconButton');
    expect(timerCard).toContain("icon={paused ? 'play' : 'pause'}");
    expect(timerCard).not.toContain("'timerPause'");
    expect(timerCard).toContain("'play'");
    expect(timerCard).toContain('icon="x"');
    expect(timerCard).toContain('timerCardAccessibilityLabel');
    expect(
      timerCard,
      'The kept +1 minute action must remain visible because it existed before C15.',
    ).toContain("title={t('mobile.timers.addMinute')}");
    expect(
      newTimerSheet,
      'New timer duration must use the frame-matching plain Minutes field.',
    ).toContain('keyboardType="number-pad"');
    expect(newTimerSheet).not.toContain('<QuantityStepper');
    expect(newTimerSheet).not.toContain('<Chip');
    expect(newTimerSheet).toContain('durationSec: minutes * 60');
    expect(newTimerSheet).toContain('const [minutes, setMinutes] = useState<number>(5)');
  });

  it('keeps Wellness on the Coral nudge-row contract (spec §9)', () => {
    const wellness = read('app', 'wellness.tsx');
    const blocks = read('features', 'wellness', 'WellnessBlocks.tsx');

    expect(wellness).toContain('<HydrationSummaryCard');
    expect(wellness).toContain('<NudgeList');
    expect(wellness).toContain('illustration="bell"');
    expect(blocks).toContain('name="droplet"');
    expect(blocks).toContain('<Progress');
    expect(blocks).toContain('variant="numeralSmall"');
    expect(blocks).toContain('kioskCardAccessibilityLabel');
    expect(blocks).toContain('wellnessNudgeAccessibilityLabel');
    expect(blocks).toContain('variant="inverse"');
    expect(blocks).toContain('leadingIcon="settings"');
    expect(blocks).not.toContain('tintNamed');
    expect(blocks).not.toContain('radius.pill');
    expect(blocks).not.toContain('colors.accent');
  });

  it('keeps the smart screen on the Coral kiosk card contract (spec §9)', () => {
    const screen = read('app', 'screen.tsx');

    expect(screen).toContain('kioskLayoutMode(width, height)');
    expect(screen).toContain("mode === 'tablet'");
    expect(screen).toContain("mode === 'wide'");
    expect(screen).toContain('variant="numeral"');
    expect(screen).toContain('<KioskPlanCard');
    expect(screen).toContain('<KioskTimerCard');
    expect(screen).toContain('<KioskHydrationCard');
    expect(screen).toContain('kioskCardAccessibilityLabel');
    expect(screen).toContain('const titleAccessibilityLabel = kioskCardAccessibilityLabel');
    expect(screen).toContain('{householdName}');
    expect(screen).toContain('KIOSK_PORTRAIT_CARD_MIN_HEIGHT = 142');
    expect(screen).toContain("if (mode === 'portrait') return { flex: 0");
    expect(screen).toMatch(/<AppText variant=\{mode === 'tablet' \? 'numeral' : 'numeralSmall'\}>/);
    expect(screen).not.toContain('`${timer.label} · ${remaining}`');
    expect(screen).not.toContain("variant={mode === 'tablet' ? 'display' : 'numeralSmall'}");
    expect(screen).toContain("router.push('/timers')");
    expect(screen).toContain("router.push('/wellness')");
    expect(screen).toContain("t('mobile.screen.rotateHint')");
    expect(screen).toContain('useKeepAwake()');
    expect(screen).toContain('void ScreenOrientation.unlockAsync()');
    expect(screen).toContain('useHouseholds()');
    expect(screen).toContain('useAuthStore');
    expect(screen).toContain('useTimerTick(needsTick(timers, new Date()))');
    expect(screen).not.toContain('gradient');
    expect(screen).not.toContain('LinearGradient');
    expect(screen).not.toContain('gradientHero');
    expect(screen).not.toContain('tintNamed');
    expect(screen).not.toContain('colors.accent');
    expect(
      screen,
      'Kiosk cards should be square Coral cards, not deprecated gradient/tint bridges.',
    ).not.toMatch(/\b(tint|fill|compact)=/);
    expect(
      screen,
      'The active nudge card text group should keep its label off the nested Done button.',
    ).toContain('accessibilityLabel={planAccessibilityLabel}');
  });

  it('keeps capture result retake in the fixed trailing icon slot', () => {
    const capture = read('features', 'capture', 'PhotoCapture.tsx');
    const resultTrailing =
      capture.match(/flow === 'result' \? \([\s\S]*?\) : cameraGranted/)?.[0] ?? '';

    expect(resultTrailing).toContain('<IconButton');
    expect(resultTrailing).toContain('icon="refresh"');
    expect(resultTrailing).toContain('tone="media"');
    expect(resultTrailing).toContain("accessibilityLabel={t('mobile.capture.retake')}");
    expect(resultTrailing).not.toContain('<RoundButton');
    expect(resultTrailing).not.toContain('<Button');
    expect(resultTrailing).not.toContain("title={t('mobile.capture.retake')}");
  });
});
