import type { GeneratedPlan, GeneratedRecipe, Locale, MealSlot } from '@kitchen/contracts';
import type { PlanPromptContext } from '../prompts/prompt.types.js';
import { RECIPE_TEMPLATES, type RecipeTemplate } from './recipe-templates.js';
import {
  buildStock,
  consumeTemplate,
  isCovered,
  type WorkingStock,
} from './pantry-coverage.js';
import { synthesizeRecipe } from './synthesize-recipe.js';

/**
 * Deterministic mock plan builder. Assembles a schema-valid, locale-correct plan
 * from recorded bilingual templates, aligned to the requested dates and slots.
 *
 * It is pantry-aware: templates are scored against the working pantry snapshot
 * and fully-covered ones are strongly preferred, so mock mode produces feasible
 * daily plans for a realistic pantry (spec §5.4). When no template is covered it
 * synthesizes a real "use what you have" dish from the pantry (daily only, where
 * full coverage is required); weekly/monthly deliberately keep uncovered
 * templates so their shortfalls still flow to the shopping list. Consumption is
 * forward-simulated across slots and days, so later selections see depleted
 * stock. It respects the repeat cap, `excludeNames` and profile allergies on a
 * best-effort basis — Stage C remains the deterministic source of truth. No
 * randomness, so the demo and tests are reproducible.
 */

function localized(t: RecipeTemplate, locale: Locale): RecipeTemplate['en'] {
  return locale === 'ar' ? t.ar : t.en;
}

function templateToRecipe(t: RecipeTemplate, locale: Locale, servings: number): GeneratedRecipe {
  const text = localized(t, locale);
  return {
    title: text.title,
    description: text.description,
    cuisine: t.cuisine,
    difficulty: t.difficulty,
    prepMinutes: t.prepMinutes,
    cookMinutes: t.cookMinutes,
    servings,
    ingredients: t.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
    })),
    steps: [...text.steps],
    nutritionPerServing: t.nutritionPerServing,
  };
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime());
  return Math.round(ms / 86_400_000);
}

function mentions(t: RecipeTemplate, names: string[]): boolean {
  const low = names.map((n) => n.toLowerCase()).filter(Boolean);
  return t.ingredients.some((ing) => {
    const name = ing.name.toLowerCase();
    return low.some((n) => name.includes(n) || n.includes(name));
  });
}

interface Placement {
  templateId: string;
  date: string;
}

function pickCoveredTemplate(
  ctx: PlanPromptContext,
  slot: MealSlot,
  date: string,
  placements: Placement[],
  stock: WorkingStock,
): RecipeTemplate | null {
  const usedTitles = new Set(ctx.alreadyUsedTitles.map((s) => s.toLowerCase()));
  const forSlot = RECIPE_TEMPLATES.filter((t) => t.slots.includes(slot));

  const passesConstraints = (t: RecipeTemplate): boolean =>
    !mentions(t, ctx.constraints.excludeNames) &&
    !mentions(t, ctx.constraints.allergies) &&
    !usedTitles.has(localized(t, ctx.locale).title.toLowerCase());

  const preferred = forSlot.filter(passesConstraints);
  const pool = preferred.length > 0 ? preferred : forSlot;
  const covered = pool.filter((t) => isCovered(t, stock));
  if (covered.length === 0) return null;

  const sorted = orderByRepeatAvoidance(covered, date, placements);
  // Honour the repeat cap when a covered candidate is still under it; otherwise
  // a covered repeat still beats an uncovered day, so fall back to the best.
  const underCap = sorted.filter((t) => windowCount(t, date, placements) < ctx.maxRepeatsPerWeek);
  return (underCap[0] ?? sorted[0]) as RecipeTemplate;
}

/**
 * Best-effort template when nothing is covered and synthesis is not available
 * (weekly/monthly, or an empty pantry). Mirrors the original slot + constraint +
 * repeat-avoidance selection so a schema-valid plan is always produced; its
 * shortfalls are then surfaced by Stage C (shopping list) or make a daily plan
 * fail with `PLAN_INFEASIBLE`, as the spec requires.
 */
function pickFallbackTemplate(
  ctx: PlanPromptContext,
  slot: MealSlot,
  date: string,
  placements: Placement[],
): RecipeTemplate {
  const usedTitles = new Set(ctx.alreadyUsedTitles.map((s) => s.toLowerCase()));
  const forSlot = RECIPE_TEMPLATES.filter((t) => t.slots.includes(slot));

  const passesConstraints = (t: RecipeTemplate): boolean =>
    !mentions(t, ctx.constraints.excludeNames) &&
    !mentions(t, ctx.constraints.allergies) &&
    !usedTitles.has(localized(t, ctx.locale).title.toLowerCase());

  const preferred = forSlot.filter(passesConstraints);
  const pool = preferred.length > 0 ? preferred : forSlot.length > 0 ? forSlot : RECIPE_TEMPLATES;

  const sorted = orderByRepeatAvoidance(pool, date, placements);
  const underCap = sorted.filter((t) => windowCount(t, date, placements) < ctx.maxRepeatsPerWeek);
  return (underCap[0] ?? sorted[0]) as RecipeTemplate;
}

function windowCount(t: RecipeTemplate, date: string, placements: Placement[]): number {
  return placements.filter((p) => p.templateId === t.id && daysApart(p.date, date) <= 6).length;
}

function totalCount(t: RecipeTemplate, placements: Placement[]): number {
  return placements.filter((p) => p.templateId === t.id).length;
}

/** Least-recently/least-used first, then stable by template order. */
function orderByRepeatAvoidance(
  pool: RecipeTemplate[],
  date: string,
  placements: Placement[],
): RecipeTemplate[] {
  return [...pool].sort((a, b) => {
    const wa = windowCount(a, date, placements);
    const wb = windowCount(b, date, placements);
    if (wa !== wb) return wa - wb;
    const ta = totalCount(a, placements);
    const tb = totalCount(b, placements);
    if (ta !== tb) return ta - tb;
    return RECIPE_TEMPLATES.indexOf(a) - RECIPE_TEMPLATES.indexOf(b);
  });
}

export interface MockPlanOptions {
  /** Fixture selector. `empty` forces an empty pantry to exercise infeasibility. */
  scenario?: string;
}

export function buildMockPlan(ctx: PlanPromptContext, options: MockPlanOptions = {}): GeneratedPlan {
  const forceEmpty = (options.scenario ?? '').includes('empty');
  const stock = buildStock(forceEmpty ? [] : ctx.pantry);
  const placements: Placement[] = [];
  const entries: GeneratedPlan['entries'] = [];
  const producedTitles = new Set(ctx.alreadyUsedTitles.map((s) => s.trim().toLowerCase()));

  for (const date of ctx.dates) {
    for (const slot of ctx.slots) {
      const covered = pickCoveredTemplate(ctx, slot, date, placements, stock);
      if (covered) {
        placements.push({ templateId: covered.id, date });
        consumeTemplate(covered, stock);
        const recipe = templateToRecipe(covered, ctx.locale, ctx.servings);
        producedTitles.add(recipe.title.trim().toLowerCase());
        entries.push({ date, slot, recipe });
        continue;
      }

      // Daily plans must be fully covered, so fill the gap with a real dish built
      // from the pantry. Weekly/monthly keep the (uncovered) template on purpose
      // so the shortfall becomes a shopping-list item.
      if (ctx.scope === 'daily') {
        const synth = synthesizeRecipe(ctx, slot, stock, producedTitles);
        if (synth) {
          entries.push({ date, slot, recipe: synth });
          continue;
        }
      }

      const fallback = pickFallbackTemplate(ctx, slot, date, placements);
      placements.push({ templateId: fallback.id, date });
      consumeTemplate(fallback, stock);
      const recipe = templateToRecipe(fallback, ctx.locale, ctx.servings);
      producedTitles.add(recipe.title.trim().toLowerCase());
      entries.push({ date, slot, recipe });
    }
  }

  return { entries };
}

/**
 * Recorded malformed plan output used to exercise the schema-guard repair path
 * (spec §8). Fails {@link generatedPlanSchema}: bad date, unknown slot, empty
 * recipe.
 */
export const INVALID_PLAN_RAW: unknown = {
  entries: [{ date: 'tomorrow', slot: 'brunch', recipe: { title: '' } }],
};
