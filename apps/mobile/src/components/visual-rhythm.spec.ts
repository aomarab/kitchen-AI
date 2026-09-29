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

  it('keeps the add strip as a separate 44pt field and inverse plus button', () => {
    expect(addField).toContain('gap: spacing.sm');
    expect(addField).toContain('minHeight: 44');
    expect(addField).toContain('backgroundColor: colors.surfaceAlt');
    expect(addField).toContain('tone="inverse"');
    expect(addField).toContain('borderRadius: radius.none');
    expect(addField).toContain('paddingHorizontal: 14');
  });
});

describe('capture and review Coral rhythm', () => {
  const chrome = read('../features/capture/CaptureChrome.tsx');
  const photo = read('../features/capture/PhotoCapture.tsx');
  const shutter = read('../features/capture/Shutter.tsx');
  const pins = read('../features/capture/ArPins.tsx');
  const review = read('../features/capture/ReviewList.tsx');
  const row = read('../features/capture/ReviewTile.tsx');

  it('keeps media capture on inverse tokens with square media buttons', () => {
    expect(chrome).toContain('colors.surfaceInverse');
    expect(chrome).toContain('tone="media"');
    expect(chrome).toContain('colors.primaryInverse');
    expect(photo).toContain('colors.surfaceInverseAlt');
    expect(photo).not.toContain('RoundButton');
  });

  it('uses the single allowed circle only for the shutter', () => {
    expect(shutter).toContain('SHUTTER_RING_SIZE = 76');
    expect(shutter).toContain('SHUTTER_CORE_SIZE = 60');
    expect(shutter).toContain('radius.shutter');
    expect(`${chrome}\n${photo}\n${pins}\n${review}\n${row}`).not.toMatch(/borderRadius:\s*\d+/);
  });

  it('draws review as flat rows with a sticky footer, not bento tiles', () => {
    expect(review).toContain("footer?: 'inline' | 'none'");
    expect(review).toContain('orderedReviewRows');
    expect(row).toContain('borderBottomColor: colors.rowline');
    expect(row).toContain('paddingVertical: 10');
    expect(review).not.toContain('<Bento');
    expect(row).not.toContain('<Tile');
  });
});

describe('recipe and cook Coral rhythm', () => {
  const recipe = read('../app/recipe/[id]/index.tsx');
  const cook = read('../app/recipe/[id]/cook.tsx');
  const ingredientRow = read('../features/recipe/RecipeIngredientRow.tsx');
  const stepRow = read('../features/recipe/RecipeStepRow.tsx');
  const metaRow = read('../features/recipe/RecipeMetaRow.tsx');
  const cookedSheet = read('../features/recipe/RecipeCookedSheetContent.tsx');

  it('draws recipe detail from Coral rows and media icon buttons, not legacy tiles', () => {
    expect(recipe).toContain('RECIPE_FOOTER_ACTION_HEIGHT = 44');
    expect(recipe).toContain('const HERO_HEIGHT = 280');
    expect(recipe).toContain("tone={barBacked ? 'plain' : 'media'}");
    expect(recipe).not.toContain('RoundButton');
    expect(recipe).not.toContain('<Tile');
    expect(recipe).not.toContain('<ListRow');
    expect(recipe).not.toContain('<ListGroup');

    expect(metaRow).toContain('borderBottomColor: colors.rowline');
    expect(metaRow).toContain('paddingVertical: spacing.md');
    expect(ingredientRow).toContain('RECIPE_INGREDIENT_ROW_MIN_HEIGHT = 44');
    expect(ingredientRow).toContain('recipeIngredientAccessibilityLabel');
    expect(ingredientRow).toContain('recipeIngredientStatusKey');
    expect(ingredientRow).toContain('accessible');
    expect(ingredientRow).toContain('accessibilityLabel={accessibilityLabel}');
    expect(ingredientRow).toContain('t(recipeIngredientStatusKey(ingredient))');
    expect(ingredientRow).toContain(
      "optionalLabel: ingredient.optional ? t('recipe.optional') : null",
    );
    expect(ingredientRow).toContain('width: 72');
    expect(ingredientRow).toContain('name={statusIcon}');
    expect(stepRow).toContain('STEP_NUMBER_BOX_SIZE = 28');
    expect(stepRow).toContain('borderWidth: 1.5');
    expect(stepRow).toContain('borderBottomColor: colors.rowline');
  });

  it('keeps the cooked sheet as an action sheet with the original mutation trigger', () => {
    expect(cookedSheet).not.toContain('<StarRating');
    expect(cookedSheet).toContain('deductInventory: true');
    expect(cookedSheet).toContain('servings: servingCount');
    expect(cookedSheet).toContain("t('recipe.cookedConfirm')");
    expect(cookedSheet).toContain("t('recipe.markCooked')");
  });

  it('keeps cook mode square, dark, and progress-driven without the retired orb chrome', () => {
    expect(cook).toContain('ThemeModeOverride mode="dark"');
    expect(cook).toContain('<StatusBar style="light" />');
    expect(cook).toContain('COOK_NAV_TARGET_HEIGHT = 44');
    expect(cook).toContain('<Progress');
    expect(cook).toContain('label="M"');
    expect(cook).not.toContain('<OrbMascot');
    expect(cook).not.toContain('RoundButton');
    expect(cook).not.toContain('tintNamed');
  });
});

describe('account and settings Coral rhythm', () => {
  const account = read('../app/account.tsx');
  const accountHero = read('../features/account/AccountHero.tsx');
  const profile = read('../app/profile.tsx');
  const settings = read('../app/settings/index.tsx');
  const household = read('../app/settings/household.tsx');
  const notifications = read('../features/settings/NotificationSettings.tsx');
  const reminders = read('../app/settings/reminders.tsx');
  const assistant = read('../features/settings/AssistantPersonaPicker.tsx');
  const feedback = read('../app/settings/feedback.tsx');
  const deleteAccount = read('../app/settings/delete-account.tsx');

  it('draws Account as a flat Coral settings list with a 56pt avatar hero', () => {
    expect(account).toContain('<AccountHero');
    expect(accountHero).toContain('ACCOUNT_HERO_MIN_HEIGHT = 80');
    expect(accountHero).toContain('size={56}');
    expect(account).toContain('variant="ghost"');
    expect(account).toContain('tone="danger"');
    expect(account).not.toContain('grouped');
    expect(account).not.toContain('variant="danger"');
  });

  it('keeps Preferences controls flat with a sticky primary Save action', () => {
    expect(profile).toContain('footer={');
    expect(profile).toContain('saveAllergy');
    expect(profile).toContain('<QuantityStepper');
    expect(profile).toContain('<Chip');
    expect(profile).not.toContain('<Card');
    expect(profile).not.toContain('grouped');
  });

  it('keeps Settings, Household, Notifications and Reminders on square rows', () => {
    expect(settings).toContain('<ThemePicker');
    expect(settings).toContain('chooseLocale(nextLocale)');
    expect(settings).not.toContain('<Card');
    expect(settings).not.toContain('grouped');

    expect(household).toContain('footer={');
    expect(household).toContain('backgroundColor: colors.surfaceAlt');
    expect(household).toContain('<Avatar');
    expect(household).not.toContain('grouped');

    expect(notifications).toContain('function ChoiceRows');
    expect(notifications).toContain('accessibilityRole="radio"');
    expect(notifications).not.toContain('<Card');
    expect(notifications).not.toContain('grouped');

    expect(reminders).toContain('function SettingStepperRow');
    expect(reminders).toContain('function QuietHourRow');
    expect(reminders).not.toContain('<Card');
    expect(reminders).not.toContain('grouped');
  });

  it('uses bordered persona cards and labels every visible persona field', () => {
    expect(assistant).toContain('PERSONA_OPTION_MIN_HEIGHT = 84');
    expect(assistant).toContain('assistantPersonaAccessibilityLabel');
    expect(assistant).toContain('borderWidth: isSelected ? 1.5 : 1');
    expect(assistant).toContain('accessibilityRole="radio"');
    expect(assistant).not.toContain('<ListRow');
    expect(assistant).not.toContain('grouped');
  });

  it('keeps feedback and deletion as footer actions with the original mutations', () => {
    expect(feedback).toContain('footer={');
    expect(feedback).toContain('StarRating');
    expect(feedback).toContain('submit.mutate');
    expect(feedback).toContain('illustration="check"');
    expect(feedback).not.toContain('<Card');

    expect(deleteAccount).toContain('footer={');
    expect(deleteAccount).toContain('matchesDeleteConfirmation');
    expect(deleteAccount).toContain('variant="destructive"');
    expect(deleteAccount).not.toContain('variant="danger"');
    expect(deleteAccount).not.toContain('borderRadius: radius.sm');
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
