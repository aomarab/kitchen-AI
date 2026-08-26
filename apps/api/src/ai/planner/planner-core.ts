import type { GeneratedPlan, GeneratedRecipe, MealSlot, PlanScope } from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import type { ResolvedName } from '../catalog/ingredient-resolver.port.js';
import { cloneSnapshot, consumeFromSnapshot } from './pantry-snapshot.js';
import { mergeShortfalls, validateRecipe } from './validation.js';
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
export interface ResolveNameRequest {
  name: string;
  nameEn?: string;
}

export type ResolveNames = (names: ResolveNameRequest[]) => Promise<ResolvedName[]>;

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
  // Keyed by the locale-facing name, which is what `toResolvedRecipe` looks up.
  // The English name rides along so the resolver can fall back to it rather
  // than creating a duplicate catalog row for an Arabic spelling.
  const names = new Map<string, ResolveNameRequest>();
  for (const entry of plan.entries) {
    for (const ing of entry.recipe.ingredients) {
      const existing = names.get(normalize(ing.name));
      const nameEn = ing.nameEn ?? undefined;
      if (existing) {
        existing.nameEn ??= nameEn;
      } else {
        names.set(normalize(ing.name), { name: ing.name, nameEn });
      }
    }
  }
  const resolved = await resolve([...names.values()]);
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
  consumeFromSnapshot(snapshot, entry.resolved);
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
 *    `maxDailyRetries`), then fail with `PLAN_INFEASIBLE` naming the
 *    shortfalls. An attempt that covers nothing at all stops the retries
 *    early — see `planDaily`.
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
  let missing: Shortfall[] = [];

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
    const shortfalls: Shortfall[] = [];
    // Every cell is judged, rather than stopping at the first failure. A
    // rejected day is the expensive case — it costs another model call — so it
    // is worth learning from the whole attempt instead of only its first bad
    // cell: how close the day came, and everything it ran short of.
    for (const cell of cells) {
      const gen = findEntry(plan, cell);
      if (!gen) continue;
      const entry = validateCell(gen, resolvedNames, trial, input.constraints);
      if (!entry.validation.safe) continue; // never surface an unsafe recipe
      if (entry.validation.shortfalls.length > 0) {
        shortfalls.push(...entry.validation.shortfalls);
        continue;
      }
      applyConsumption(trial, entry);
      entries.push(entry);
    }

    if (entries.length === cells.length) return { snapshot: trial, entries };
    missing = shortfalls;

    // Not one meal in the day could be cooked from these shelves. Retrying
    // samples the same model against the same pantry, so it will not suddenly
    // become possible — and every attempt is a paid call the household is
    // sitting and waiting on. Stop and say what is missing. A day that got
    // *partly* there is a different matter: the model may simply have spent
    // an ingredient early, and another arrangement can still work.
    if (entries.length === 0) break;
  }

  throw new AppError('PLAN_INFEASIBLE', 'errors.PLAN_INFEASIBLE', {
    retries: input.maxDailyRetries,
    // What to buy, or what to relax the plan around, instead of a dead end.
    missing: mergeShortfalls(missing).map((s) => ({
      ingredientId: s.ingredientId,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      shortfall: s.shortfall,
      unit: s.unit,
    })),
  });
}
