import type { GeneratedPlan, GeneratedRecipe, MealSlot, PlanScope } from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import type { ResolvedName } from '../catalog/ingredient-resolver.port.js';
import { cloneSnapshot } from './pantry-snapshot.js';
import { mergeShortfalls, validateRecipe } from './validation.js';
import { dimensionOf, toBase } from './units.js';
import type {
  PantrySnapshot,
  RecipeValidation,
  ResolvedRecipe,
  ResolvedRecipeIngredient,
  Shortfall,
  ValidationConstraints,
} from './types.js';

/** Stage-B generation callback. Kept abstract so the core is DB/LLM-agnostic. */
export type StageBGenerate = (params: {
  dates: string[];
  slots: MealSlot[];
  snapshot: PantrySnapshot;
  alreadyUsedTitles: string[];
  attempt: number;
}) => Promise<GeneratedPlan>;

/** Resolve recipe ingredient names to catalog rows. */
export type ResolveNames = (names: string[]) => Promise<ResolvedName[]>;

export interface PlanCoreEntry {
  date: string;
  slot: MealSlot;
  recipe: GeneratedRecipe;
  resolved: ResolvedRecipeIngredient[];
  validation: RecipeValidation;
}

export interface PlanCoreResult {
  entries: PlanCoreEntry[];
  /** Aggregated shortfalls to place on the shopping list (weekly/monthly). */
  shoppingShortfalls: Shortfall[];
}

export interface PlanCoreInput {
  scope: PlanScope;
  /** Generation groups: one per week (monthly = four), single group otherwise. */
  weeks: string[][];
  slots: MealSlot[];
  constraints: ValidationConstraints;
  maxDailyRetries: number;
  baseSnapshot: PantrySnapshot;
  generate: StageBGenerate;
  resolve: ResolveNames;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface Cell {
  date: string;
  slot: MealSlot;
}

function orderedCells(dates: string[], slots: MealSlot[]): Cell[] {
  const cells: Cell[] = [];
  for (const date of dates) {
    for (const slot of slots) cells.push({ date, slot });
  }
  return cells;
}

async function resolvePlan(
  plan: GeneratedPlan,
  resolve: ResolveNames,
): Promise<Map<string, ResolvedName>> {
  const names = new Set<string>();
  for (const entry of plan.entries) {
    for (const ing of entry.recipe.ingredients) names.add(ing.name);
  }
  const resolved = await resolve([...names]);
  const map = new Map<string, ResolvedName>();
  for (const r of resolved) map.set(normalize(r.rawName), r);
  return map;
}

function toResolvedRecipe(
  recipe: GeneratedRecipe,
  resolvedNames: Map<string, ResolvedName>,
): ResolvedRecipe {
  const ingredients: ResolvedRecipeIngredient[] = recipe.ingredients.map((i) => ({
    rawName: i.name,
    ingredient: resolvedNames.get(normalize(i.name))?.ingredient ?? null,
    quantity: i.quantity,
    unit: i.unit,
    optional: i.optional,
  }));
  return { title: recipe.title, ingredients };
}

/** Deplete the working snapshot by what an accepted recipe consumes. */
function applyConsumption(snapshot: PantrySnapshot, entry: PlanCoreEntry): void {
  for (const ing of entry.resolved) {
    if (ing.optional || !ing.ingredient) continue;
    const stock = snapshot.byIngredientId.get(ing.ingredient.id);
    if (!stock) continue;
    if (dimensionOf(ing.unit) !== stock.dimension) continue;
    stock.baseQuantity = Math.max(0, stock.baseQuantity - toBase(ing.quantity, ing.unit));
  }
}

function findEntry(plan: GeneratedPlan, cell: Cell): GeneratedPlan['entries'][number] | undefined {
  return plan.entries.find((e) => e.date === cell.date && e.slot === cell.slot);
}

function validateCell(
  gen: GeneratedPlan['entries'][number],
  resolvedNames: Map<string, ResolvedName>,
  snapshot: PantrySnapshot,
  constraints: ValidationConstraints,
): PlanCoreEntry {
  const resolvedRecipe = toResolvedRecipe(gen.recipe, resolvedNames);
  const validation = validateRecipe(resolvedRecipe, snapshot, constraints);
  return {
    date: gen.date,
    slot: gen.slot,
    recipe: gen.recipe,
    resolved: resolvedRecipe.ingredients,
    validation,
  };
}

/**
 * Stage C orchestration (spec §5.4). Validates generated recipes against the
 * real pantry and safety constraints, forward-simulating consumption so later
 * days and weeks see depleted stock:
 *
 *  - Unsafe recipes (allergy/halal) are never accepted, in any scope.
 *  - Daily: the whole day must be fully covered; otherwise regenerate (up to
 *    `maxDailyRetries`), then fail with `PLAN_INFEASIBLE`.
 *  - Weekly/monthly: shortfalls are allowed and aggregated into shopping items.
 *  - Monthly is generated week-by-week; because consumption is applied as each
 *    entry is accepted, week 3 already reflects what weeks 1–2 used.
 */
export async function runPlanner(input: PlanCoreInput): Promise<PlanCoreResult> {
  let working = cloneSnapshot(input.baseSnapshot);
  const accepted: PlanCoreEntry[] = [];
  const usedTitles: string[] = [];
  const shortfalls: Shortfall[] = [];

  for (const weekDates of input.weeks) {
    if (input.scope === 'daily') {
      const committed = await planDaily(input, weekDates, working, usedTitles);
      working = committed.snapshot;
      for (const e of committed.entries) {
        accepted.push(e);
        usedTitles.push(e.recipe.title);
      }
    } else {
      const plan = await input.generate({
        dates: weekDates,
        slots: input.slots,
        snapshot: working,
        alreadyUsedTitles: usedTitles,
        attempt: 0,
      });
      const resolvedNames = await resolvePlan(plan, input.resolve);
      for (const cell of orderedCells(weekDates, input.slots)) {
        const gen = findEntry(plan, cell);
        if (!gen) continue;
        const entry = validateCell(gen, resolvedNames, working, input.constraints);
        if (!entry.validation.safe) continue; // never surface an unsafe recipe
        applyConsumption(working, entry);
        accepted.push(entry);
        usedTitles.push(entry.recipe.title);
        shortfalls.push(...entry.validation.shortfalls);
      }
    }
  }

  return { entries: accepted, shoppingShortfalls: mergeShortfalls(shortfalls) };
}

async function planDaily(
  input: PlanCoreInput,
  dates: string[],
  working: PantrySnapshot,
  usedTitles: string[],
): Promise<{ snapshot: PantrySnapshot; entries: PlanCoreEntry[] }> {
  const cells = orderedCells(dates, input.slots);

  for (let attempt = 0; attempt <= input.maxDailyRetries; attempt++) {
    const trial = cloneSnapshot(working);
    const plan = await input.generate({
      dates,
      slots: input.slots,
      snapshot: trial,
      alreadyUsedTitles: usedTitles,
      attempt,
    });
    const resolvedNames = await resolvePlan(plan, input.resolve);

    const entries: PlanCoreEntry[] = [];
    let feasible = true;
    for (const cell of cells) {
      const gen = findEntry(plan, cell);
      if (!gen) {
        feasible = false;
        break;
      }
      const entry = validateCell(gen, resolvedNames, trial, input.constraints);
      if (!entry.validation.safe || entry.validation.shortfalls.length > 0) {
        feasible = false;
        break;
      }
      applyConsumption(trial, entry);
      entries.push(entry);
    }

    if (feasible) return { snapshot: trial, entries };
  }

  throw new AppError('PLAN_INFEASIBLE', 'errors.PLAN_INFEASIBLE', {
    retries: input.maxDailyRetries,
  });
}
