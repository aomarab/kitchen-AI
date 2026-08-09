import { describe, expect, it, vi } from 'vitest';
import { MAX_RECIPE_REPEATS_PER_WEEK } from '@kitchen/contracts';
import type { Locale, PlanScope } from '@kitchen/contracts';
import { runPlanner, type StageBGenerate } from '../planner/planner-core.js';
import { pantryLinesByExpiry } from '../planner/pantry-snapshot.js';
import { fromBase } from '../planner/units.js';
import type { PantrySnapshot } from '../planner/types.js';
import { buildMockPlan } from '../fixtures/plan.fixtures.js';
import { buildStock, isCovered } from '../fixtures/pantry-coverage.js';
import { RECIPE_TEMPLATES } from '../fixtures/recipe-templates.js';
import type { PlanConstraints, PlanPromptContext } from '../prompts/prompt.types.js';
import { cat, resolverFor, snapshotOf } from './helpers.js';
import type { CatalogIngredientRef } from '../planner/types.js';

/* ------------------------------------------------------------------ */
/* Catalog refs mirroring the seed catalog (staple flags matter).       */
/* ------------------------------------------------------------------ */

const romaTomato = cat({ canonicalNameEn: 'Roma tomato', canonicalNameAr: 'طماطم روما', category: 'vegetable', defaultUnit: 'g', isStaple: false });
const chickenBreast = cat({ canonicalNameEn: 'Chicken breast', canonicalNameAr: 'صدر دجاج', category: 'poultry', defaultUnit: 'g', isStaple: false });

const eggs = cat({ canonicalNameEn: 'Chicken eggs', canonicalNameAr: 'بيض دجاج', category: 'egg', defaultUnit: 'piece', isStaple: true });
const onion = cat({ canonicalNameEn: 'Onion', canonicalNameAr: 'بصل', category: 'vegetable', defaultUnit: 'piece', isStaple: true });
const garlic = cat({ canonicalNameEn: 'Garlic', canonicalNameAr: 'ثوم', category: 'vegetable', defaultUnit: 'clove', isStaple: true });
const evoo = cat({ canonicalNameEn: 'Extra virgin olive oil', canonicalNameAr: 'زيت زيتون بكر ممتاز', category: 'oil', defaultUnit: 'ml', isStaple: true });
const cumin = cat({ canonicalNameEn: 'Ground cumin', canonicalNameAr: 'كمون مطحون', category: 'spice', defaultUnit: 'g', isStaple: true });
const salt = cat({ canonicalNameEn: 'Salt', canonicalNameAr: 'ملح', category: 'spice', defaultUnit: 'g', isStaple: true });
const basmati = cat({ canonicalNameEn: 'Basmati rice', canonicalNameAr: 'أرز بسمتي', category: 'grain', defaultUnit: 'g', isStaple: true });
const turmeric = cat({ canonicalNameEn: 'Turmeric', canonicalNameAr: 'كركم', category: 'spice', defaultUnit: 'g', isStaple: true });

const CATALOG = [romaTomato, chickenBreast, eggs, onion, garlic, evoo, cumin, salt, basmati, turmeric];

/* ------------------------------------------------------------------ */
/* Harness that wires the mock exactly as PlannerService.stageB does.   */
/* ------------------------------------------------------------------ */

function constraintsFor(overrides: Partial<PlanConstraints> = {}): PlanConstraints {
  return {
    dietaryPrefs: [],
    allergies: [],
    halal: false,
    cuisinePrefs: [],
    householdSize: 4,
    maxCookMinutes: null,
    excludeNames: [],
    ...overrides,
  };
}

function ctxFor(params: {
  snapshot: PantrySnapshot;
  locale?: Locale;
  scope?: PlanScope;
  servings?: number;
  dates: string[];
  slots: PlanPromptContext['slots'];
  constraints?: PlanConstraints;
  alreadyUsedTitles?: string[];
}): PlanPromptContext {
  const locale = params.locale ?? 'en';
  const pantry = pantryLinesByExpiry(params.snapshot).map((e) => ({
    name: locale === 'ar' ? e.nameAr : e.nameEn,
    nameEn: e.nameEn,
    nameAr: e.nameAr,
    quantity: Math.round(fromBase(e.baseQuantity, e.displayUnit) * 100) / 100,
    unit: e.displayUnit,
    expiresOn: e.expiresOn,
    isStaple: e.isStaple,
  }));
  return {
    locale,
    scope: params.scope ?? 'daily',
    dates: params.dates,
    slots: params.slots,
    servings: params.servings ?? 4,
    constraints: params.constraints ?? constraintsFor(),
    pantry,
    maxRepeatsPerWeek: MAX_RECIPE_REPEATS_PER_WEEK,
    alreadyUsedTitles: params.alreadyUsedTitles ?? [],
  };
}

/** A Stage-B callback that drives the real mock builder, like production. */
function mockGenerate(opts: {
  locale?: Locale;
  scope?: PlanScope;
  servings?: number;
  constraints?: PlanConstraints;
  scenario?: string;
}): StageBGenerate {
  return async ({ dates, slots, snapshot, alreadyUsedTitles }) => {
    const ctx = ctxFor({
      snapshot,
      locale: opts.locale,
      scope: opts.scope,
      servings: opts.servings,
      dates,
      slots,
      constraints: opts.constraints,
      alreadyUsedTitles,
    });
    return buildMockPlan(ctx, { scenario: opts.scenario });
  };
}

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;

const REALISTIC = () =>
  snapshotOf([
    { ref: romaTomato, quantity: 800, unit: 'g' },
    { ref: chickenBreast, quantity: 1500, unit: 'g' },
    { ref: onion, quantity: 3, unit: 'piece' },
    { ref: garlic, quantity: 5, unit: 'clove' },
  ]);

/* ------------------------------------------------------------------ */
/* Tests                                                                */
/* ------------------------------------------------------------------ */

describe('mock planner — pantry-aware daily feasibility (spec §5.4 / §5.6)', () => {
  it('produces a feasible Arabic daily plan with zero shortfalls from a realistic pantry', async () => {
    const generate = vi.fn(mockGenerate({ locale: 'ar', scope: 'daily' }));
    const result = await runPlanner({
      scope: 'daily',
      weeks: [['2026-08-01']],
      slots: ['breakfast', 'lunch', 'dinner'],
      constraints: { allergies: [], halal: false },
      maxDailyRetries: 2,
      baseSnapshot: REALISTIC(),
      generate,
      resolve: resolverFor(CATALOG),
    });

    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((e) => e.validation.fullyCovered)).toBe(true);
    expect(result.shoppingShortfalls).toHaveLength(0);
    // First attempt is feasible — no retry loop.
    expect(generate).toHaveBeenCalledTimes(1);

    // Genuinely Arabic output drawn from the pantry.
    for (const entry of result.entries) {
      expect(ARABIC.test(entry.recipe.title)).toBe(true);
      expect(entry.recipe.steps.every((s) => ARABIC.test(s))).toBe(true);
    }
  });

  it('fails with PLAN_INFEASIBLE when the pantry is empty', async () => {
    await expect(
      runPlanner({
        scope: 'daily',
        weeks: [['2026-08-01']],
        slots: ['breakfast', 'lunch', 'dinner'],
        constraints: { allergies: [], halal: false },
        maxDailyRetries: 2,
        baseSnapshot: snapshotOf([]),
        generate: mockGenerate({ scope: 'daily' }),
        resolve: resolverFor(CATALOG),
      }),
    ).rejects.toMatchObject({ code: 'PLAN_INFEASIBLE' });
  });

  it('fails with PLAN_INFEASIBLE for a stocked pantry when the empty scenario is forced', async () => {
    await expect(
      runPlanner({
        scope: 'daily',
        weeks: [['2026-08-01']],
        slots: ['breakfast', 'lunch', 'dinner'],
        constraints: { allergies: [], halal: false },
        maxDailyRetries: 2,
        baseSnapshot: REALISTIC(),
        generate: mockGenerate({ scope: 'daily', scenario: 'empty' }),
        resolve: resolverFor(CATALOG),
      }),
    ).rejects.toMatchObject({ code: 'PLAN_INFEASIBLE' });
  });
});

describe('mock planner — coverage respects quantities, not just presence', () => {
  const chickenRice = RECIPE_TEMPLATES.find((t) => t.id === 'chicken-rice')!;

  it('an under-stocked non-staple ingredient makes a template uncovered', () => {
    const short = buildStock([
      { name: 'Chicken breast', nameEn: 'Chicken breast', nameAr: 'صدر دجاج', quantity: 100, unit: 'g', expiresOn: null, isStaple: false },
    ]);
    const enough = buildStock([
      { name: 'Chicken breast', nameEn: 'Chicken breast', nameAr: 'صدر دجاج', quantity: 700, unit: 'g', expiresOn: null, isStaple: false },
    ]);
    // chicken-rice needs 600 g chicken breast (its only non-staple ingredient).
    expect(isCovered(chickenRice, short)).toBe(false);
    expect(isCovered(chickenRice, enough)).toBe(true);
  });
});

describe('mock planner — forward-simulated consumption drives later selections', () => {
  const chickenRiceAr = RECIPE_TEMPLATES.find((t) => t.id === 'chicken-rice')!.ar.title;

  it('depletes stock so a template covered on day 1 is not reused once it runs out', () => {
    const plan = buildMockPlan(
      ctxFor({
        snapshot: snapshotOf([{ ref: chickenBreast, quantity: 1000, unit: 'g' }]),
        locale: 'ar',
        scope: 'weekly',
        dates: ['2026-08-01', '2026-08-02'],
        slots: ['lunch'],
      }),
    );
    // 1000 g covers one 600 g chicken-rice; the leftover 400 g cannot cover a second.
    expect(plan.entries[0]?.recipe.title).toBe(chickenRiceAr);
    expect(plan.entries[1]?.recipe.title).not.toBe(chickenRiceAr);
  });

  it('reuses the template on both days when the stock can support both', () => {
    const plan = buildMockPlan(
      ctxFor({
        snapshot: snapshotOf([{ ref: chickenBreast, quantity: 1400, unit: 'g' }]),
        locale: 'ar',
        scope: 'weekly',
        dates: ['2026-08-01', '2026-08-02'],
        slots: ['lunch'],
      }),
    );
    expect(plan.entries[0]?.recipe.title).toBe(chickenRiceAr);
    expect(plan.entries[1]?.recipe.title).toBe(chickenRiceAr);
  });
});

describe('mock planner — synthesized fallback recipe', () => {
  const zucchini: CatalogIngredientRef = cat({ canonicalNameEn: 'Zucchini', canonicalNameAr: 'كوسا', category: 'vegetable', defaultUnit: 'g', isStaple: false });
  const carrot: CatalogIngredientRef = cat({ canonicalNameEn: 'Carrot', canonicalNameAr: 'جزر', category: 'vegetable', defaultUnit: 'g', isStaple: false });
  const peanuts: CatalogIngredientRef = cat({ canonicalNameEn: 'Peanuts', canonicalNameAr: 'فول سوداني', category: 'nut', defaultUnit: 'g', isStaple: false });

  it('synthesizes a genuinely Arabic dish from pantry ingredients within available quantities', () => {
    const plan = buildMockPlan(
      ctxFor({
        snapshot: snapshotOf([
          { ref: zucchini, quantity: 500, unit: 'g' },
          { ref: carrot, quantity: 300, unit: 'g' },
        ]),
        locale: 'ar',
        scope: 'daily',
        servings: 4,
        dates: ['2026-08-01'],
        slots: ['lunch'],
      }),
    );

    const recipe = plan.entries[0]!.recipe;
    // No recorded template is covered by these ingredients, so this is synthesized.
    expect(recipe.ingredients.length).toBeGreaterThan(0);
    expect(ARABIC.test(recipe.title)).toBe(true);
    expect(recipe.steps.length).toBeGreaterThan(0);
    for (const step of recipe.steps) {
      expect(ARABIC.test(step)).toBe(true);
      expect(LATIN.test(step)).toBe(false);
    }
    // Ingredients are drawn only from the pantry, in Arabic, within stock.
    const byName = new Map(recipe.ingredients.map((i) => [i.name, i]));
    expect([...byName.keys()].every((n) => n === 'كوسا' || n === 'جزر')).toBe(true);
    expect(byName.get('كوسا')!.quantity).toBeLessThanOrEqual(500);
    if (byName.has('جزر')) expect(byName.get('جزر')!.quantity).toBeLessThanOrEqual(300);
  });

  it('never synthesizes with an allergen or an excluded ingredient', () => {
    const allergyPlan = buildMockPlan(
      ctxFor({
        snapshot: snapshotOf([
          { ref: zucchini, quantity: 500, unit: 'g' },
          { ref: peanuts, quantity: 300, unit: 'g' },
        ]),
        scope: 'daily',
        dates: ['2026-08-01'],
        slots: ['lunch'],
        constraints: constraintsFor({ allergies: ['peanut'] }),
      }),
    );
    const allergyNames = allergyPlan.entries[0]!.recipe.ingredients.map((i) => i.name);
    expect(allergyNames).toContain('Zucchini');
    expect(allergyNames).not.toContain('Peanuts');

    const excludePlan = buildMockPlan(
      ctxFor({
        snapshot: snapshotOf([
          { ref: zucchini, quantity: 500, unit: 'g' },
          { ref: carrot, quantity: 300, unit: 'g' },
        ]),
        scope: 'daily',
        dates: ['2026-08-01'],
        slots: ['lunch'],
        constraints: constraintsFor({ excludeNames: ['Carrot'] }),
      }),
    );
    const excludeNames = excludePlan.entries[0]!.recipe.ingredients.map((i) => i.name);
    expect(excludeNames).toContain('Zucchini');
    expect(excludeNames).not.toContain('Carrot');
  });
});

describe('mock planner — weekly still surfaces shortfalls as shopping items', () => {
  it('aggregates a shortfall once the covered template runs out mid-week', async () => {
    const result = await runPlanner({
      scope: 'weekly',
      weeks: [['2026-08-01', '2026-08-02']],
      slots: ['dinner'],
      constraints: { allergies: [], halal: false },
      maxDailyRetries: 2,
      baseSnapshot: snapshotOf([{ ref: chickenBreast, quantity: 1000, unit: 'g' }]),
      generate: mockGenerate({ scope: 'weekly' }),
      resolve: resolverFor(CATALOG),
    });

    expect(result.entries).toHaveLength(2);
    // Day 1 chicken-rice is covered; day 2 cannot repeat it, so an uncovered
    // fallback template is kept on purpose and its shortfall must be reported —
    // pantry-awareness must not silently suppress the shopping list.
    expect(result.entries[0]?.validation.fullyCovered).toBe(true);
    expect(result.shoppingShortfalls.length).toBeGreaterThan(0);
  });
});
