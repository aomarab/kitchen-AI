import { describe, expect, it } from 'vitest';
import {
  generatedPlanSchema,
  receiptExtractionSchema,
  unitSchema,
  visionResultSchema,
} from '@kitchen/contracts';
import {
  MAX_RECIPES_PER_GENERATION,
  planDates,
  planGroups,
} from '../planner/date-range.js';
import { PROVIDER_MAX_OUTPUT_TOKENS, PROVIDER_MAX_RETRIES } from '../ai.constants.js';
import { buildPlanningPrompt } from '../prompts/planning.prompt.js';
import type { PlanPromptContext } from '../prompts/prompt.types.js';

/**
 * Everything here was found by running the real OpenAI provider once, not by
 * reading code. Both defects were invisible under AI_MOCK because the mock
 * returns fixtures that are schema-perfect by construction — the mock can only
 * ever prove the plumbing, never the agreement between prompt and schema.
 *
 * Real result: every Arabic plan generation failed, twice-billed, 100% of the
 * time.
 */

function planCtx(locale: 'ar' | 'en'): PlanPromptContext {
  return {
    locale,
    scope: 'daily',
    dates: ['2026-07-27'],
    slots: ['lunch'],
    servings: 4,
    maxRepeatsPerWeek: 2,
    alreadyUsedTitles: [],
    note: null,
    pantry: [{ name: 'Rice', quantity: 1, unit: 'kg', expiresOn: null, isStaple: true }],
    constraints: {
      householdSize: 4,
      halal: true,
      allergies: [],
      dietaryPrefs: [],
      cuisinePrefs: [],
      excludeNames: [],
      maxCookMinutes: null,
    },
  } as unknown as PlanPromptContext;
}

describe('locale directive vs. enum values', () => {
  it('tells the model that fixed-set values stay ASCII English', () => {
    const { system } = buildPlanningPrompt(planCtx('ar'));
    // The observed failure was difficulty: "سهل" on every entry.
    expect(system).toMatch(/difficulty/);
    expect(system).toMatch(/never translate/i);
    expect(system).toMatch(/ascii/i);
  });

  it('asks for explicit nulls rather than omitted keys', () => {
    const { system } = buildPlanningPrompt(planCtx('ar'));
    expect(system).toMatch(/never omit a key/i);
  });

  it('carries the carve-out in English too, so both locales agree', () => {
    expect(buildPlanningPrompt(planCtx('en')).system).toMatch(/never translate/i);
  });
});

describe('model-output schemas tolerate omitted nullable keys', () => {
  // Trimmed from the actual failing gpt-5-2025-08-07 response.
  const realRecipe = {
    title: 'أرز بالخضار',
    description: 'طبق أرز بسيط',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 25,
    servings: 4,
    ingredients: [{ name: 'Rice', quantity: 1, unit: 'kg', optional: false }],
    steps: ['اغسل الأرز'],
    // Note what is NOT here: `cuisine` and `nutritionPerServing`. The model
    // omitted both. Under `.nullable()` alone this is a hard validation error.
  };

  it('accepts a recipe with cuisine and nutrition omitted', () => {
    const parsed = generatedPlanSchema.safeParse({
      entries: [{ date: '2026-07-27', slot: 'lunch', recipe: realRecipe }],
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    // Omission must normalise to null, not undefined, so writers stay simple.
    expect(parsed.data!.entries[0]!.recipe.nutritionPerServing).toBeNull();
    expect(parsed.data!.entries[0]!.recipe.cuisine).toBeNull();
  });

  it('still accepts explicit nulls', () => {
    const parsed = generatedPlanSchema.safeParse({
      entries: [
        {
          date: '2026-07-27',
          slot: 'lunch',
          recipe: { ...realRecipe, cuisine: null, nutritionPerServing: null },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a receipt with every optional field dropped', () => {
    const parsed = receiptExtractionSchema.safeParse({
      lines: [{ rawText: 'RICE 1KG', nameGuess: 'Rice' }],
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data!.merchant).toBeNull();
    expect(parsed.data!.lines[0]!.unit).toBeNull();
  });

  it('does not let tolerance leak into genuinely required fields', () => {
    // Widening nullable keys must not make the schema accept anything.
    expect(
      generatedPlanSchema.safeParse({
        entries: [
          { date: '2026-07-27', slot: 'lunch', recipe: { ...realRecipe, title: undefined } },
        ],
      }).success,
    ).toBe(false);
    // A translated enum is still a hard failure — the prompt is the fix for
    // that, and we want to know if it regresses.
    expect(
      generatedPlanSchema.safeParse({
        entries: [
          { date: '2026-07-27', slot: 'lunch', recipe: { ...realRecipe, difficulty: 'سهل' } },
        ],
      }).success,
    ).toBe(false);
    expect(visionResultSchema.safeParse({ ingredients: [{ nameEn: 'Rice' }] }).success).toBe(false);
  });
});

describe('generation groups are sized to actually come back', () => {
  it('never asks for more recipes in one call than the measured budget', () => {
    for (const scope of ['daily', 'weekly', 'monthly'] as const) {
      for (const slots of [1, 2, 3, 4, 5]) {
        for (const group of planGroups('2026-07-27', scope, slots)) {
          expect(group.length * slots, `${scope}/${slots}`).toBeLessThanOrEqual(
            Math.max(MAX_RECIPES_PER_GENERATION, slots),
          );
        }
      }
    }
  });

  it('covers every date exactly once, in order, for every scope', () => {
    for (const scope of ['daily', 'weekly', 'monthly'] as const) {
      const expected = planDates('2026-07-27', scope);
      const flat = planGroups('2026-07-27', scope, 3).flat();
      expect(flat, scope).toEqual(expected);
    }
  });

  it('keeps a day whole rather than splitting it across calls', () => {
    // A split day would let two calls each fill part of the same day without
    // seeing the other's choices.
    for (const group of planGroups('2026-07-27', 'weekly', 3)) {
      expect(group.length).toBeGreaterThanOrEqual(1);
    }
    expect(planGroups('2026-07-27', 'weekly', 9).every((g) => g.length === 1)).toBe(true);
  });

  it('the old week-sized grouping would have exceeded the budget', () => {
    // Guards the regression directly: 7 days x 3 slots = 21 recipes per call.
    const weekly = planGroups('2026-07-27', 'weekly', 3);
    expect(weekly.length).toBeGreaterThan(1);
    expect(weekly[0]!.length).toBeLessThan(7);
  });

  it('planning is allowed fewer SDK retries than the cheap tiers', () => {
    // A timed-out planning call is billed but never recorded; retrying it
    // multiplies invisible spend.
    expect(PROVIDER_MAX_RETRIES.planning).toBeLessThan(PROVIDER_MAX_RETRIES.cheap);
  });

  it('leaves headroom over the measured per-recipe cost', () => {
    const measuredPerRecipe = 2_900;
    expect(PROVIDER_MAX_OUTPUT_TOKENS.planning).toBeGreaterThan(
      MAX_RECIPES_PER_GENERATION * measuredPerRecipe,
    );
  });
});

describe('the prompt actually states the shape it wants', () => {
  it('names every field the schema requires', () => {
    const { system } = buildPlanningPrompt(planCtx('ar'));
    for (const field of [
      'title', 'description', 'cuisine', 'difficulty', 'prepMinutes', 'cookMinutes',
      'servings', 'ingredients', 'steps', 'nutritionPerServing',
    ]) {
      expect(system, field).toContain(field);
    }
  });

  it('spells out the enum values rather than leaving them to be guessed', () => {
    const { system } = buildPlanningPrompt(planCtx('ar'));
    expect(system).toContain('"easy" | "medium" | "hard"');
    expect(system).toContain('breakfast|lunch|dinner|snack');
    // Units must come from the contract, not a hand-copied list that can drift.
    for (const unit of unitSchema.options) expect(system, unit).toContain(unit);
  });

  it('says steps are plain strings', () => {
    expect(buildPlanningPrompt(planCtx('ar')).system).toMatch(/never wrap a step in an object/i);
  });
});

describe('structured steps are recovered rather than discarded', () => {
  const base = {
    title: 'أرز', description: 'د', difficulty: 'easy', prepMinutes: 5, cookMinutes: 5,
    servings: 2, ingredients: [{ name: 'Rice', quantity: 1, unit: 'kg', optional: false }],
    cuisine: null, nutritionPerServing: null,
  };
  const parse = (steps: unknown) =>
    generatedPlanSchema.safeParse({
      entries: [{ date: '2026-07-27', slot: 'lunch', recipe: { ...base, steps } }],
    });

  it('unwraps the object form real gpt-5 returned', () => {
    const r = parse([{ step: 1, text: 'اغسل الأرز' }, { step: 2, text: 'اطبخ' }]);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(r.data!.entries[0]!.recipe.steps).toEqual(['اغسل الأرز', 'اطبخ']);
  });

  it('accepts the plain form unchanged', () => {
    expect(parse(['a', 'b']).data!.entries[0]!.recipe.steps).toEqual(['a', 'b']);
  });

  it('still rejects steps it cannot read', () => {
    expect(parse([{ nope: 1 }]).success).toBe(false);
    expect(parse([]).success).toBe(false);
    expect(parse([{ text: '   ' }]).success).toBe(false);
  });
});

describe('sourcing rule matches what the planner will actually accept', () => {
  it('keeps a daily plan strictly pantry-only', () => {
    const { system } = buildPlanningPrompt(planCtx('en'));
    expect(system).toMatch(/cookable right now/i);
    expect(system).toMatch(/only the pantry/i);
  });

  it('lets weekly and monthly reach past the pantry, as the core already does', () => {
    for (const scope of ['weekly', 'monthly'] as const) {
      const { system } = buildPlanningPrompt({ ...planCtx('en'), scope } as PlanPromptContext);
      expect(system, scope).toMatch(/shopping list/i);
      expect(system, scope).not.toMatch(/only the pantry/i);
    }
  });

  it('names the failure mode it exists to prevent', () => {
    // Real output degraded to "water soup with olive oil" once the simulated
    // pantry emptied mid-week.
    const { system } = buildPlanningPrompt({ ...planCtx('en'), scope: 'weekly' } as PlanPromptContext);
    expect(system).toMatch(/water/i);
    expect(system).toMatch(/never invent a filler recipe/i);
  });
});
