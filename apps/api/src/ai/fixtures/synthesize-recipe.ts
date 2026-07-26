import type { GeneratedRecipe, MealSlot, Unit } from '@kitchen/contracts';
import { fromBase, toBase, type Dimension } from '../planner/units.js';
import { findViolations } from '../planner/safety.js';
import type { PlanPromptContext } from '../prompts/prompt.types.js';
import { consume, isStapleName, type StockLine, type WorkingStock } from './pantry-coverage.js';

/**
 * "Use what you have" fallback for the mock planner. When no recorded template
 * is fully covered by the pantry, this assembles a single, coherent, schema-valid
 * recipe entirely from ingredients the household already has — quantities kept
 * within what is in stock and scaled by servings, so Stage C validates it as
 * fully covered and a daily plan stays feasible (spec §5.4). It refuses to use
 * anything excluded or unsafe, and returns `null` when the pantry cannot support
 * a real dish, so a genuinely empty pantry still fails with `PLAN_INFEASIBLE`.
 */

const EPSILON = 1e-6;
const MAX_INGREDIENTS = 4;

/** A modest per-serving portion in base units (g, ml, or whole count). */
const PER_SERVING_BASE: Record<Dimension, number> = { mass: 120, volume: 60, count: 0.5 };

/** Units measured in coarse whole numbers; others keep two decimals. */
const COARSE_UNITS: ReadonlySet<Unit> = new Set(['g', 'ml']);

interface ChosenIngredient {
  line: StockLine;
  quantity: number;
  unit: Unit;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesAny(names: string[], terms: string[]): boolean {
  const low = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  return names.some((raw) => {
    const name = raw.toLowerCase();
    return low.some((t) => name.includes(t) || t.includes(name));
  });
}

/** Excluded for this plan, or an allergy/halal risk — never synthesize with it. */
function isBlocked(line: StockLine, ctx: PlanPromptContext): boolean {
  const names = [line.nameEn, line.nameAr, line.displayName];
  if (matchesAny(names, ctx.constraints.excludeNames)) return true;
  const violations = findViolations(
    [
      {
        rawName: line.nameEn,
        ingredient: {
          id: '',
          canonicalNameEn: line.nameEn,
          canonicalNameAr: line.nameAr,
          aliases: [line.displayName],
          category: 'other',
          defaultUnit: line.unit,
          isStaple: line.isStaple,
        },
        quantity: 1,
        unit: line.unit,
        optional: false,
      },
    ],
    { allergies: ctx.constraints.allergies, halal: ctx.constraints.halal },
  );
  return violations.length > 0;
}

/** Candidate stock lines, most useful first: real food, soonest expiry, most on hand. */
function selectCandidates(ctx: PlanPromptContext, stock: WorkingStock): StockLine[] {
  return [...stock.values()]
    .filter((line) => line.baseRemaining > EPSILON && !isBlocked(line, ctx))
    .sort((a, b) => {
      const staple = Number(a.isStaple) - Number(b.isStaple);
      if (staple !== 0) return staple;
      if (a.expiresOn && b.expiresOn && a.expiresOn !== b.expiresOn) {
        return a.expiresOn.localeCompare(b.expiresOn);
      }
      if (a.expiresOn && !b.expiresOn) return -1;
      if (!a.expiresOn && b.expiresOn) return 1;
      return b.baseRemaining - a.baseRemaining;
    });
}

/** A portion within available stock, rounded down so it never exceeds it. */
function portionFor(line: StockLine, servings: number): ChosenIngredient | null {
  const unit = line.unit;
  const targetBase = Math.min(line.baseRemaining, PER_SERVING_BASE[line.dimension] * servings);
  if (targetBase <= 0) return null;

  let quantity: number;
  if (line.dimension === 'count') {
    quantity = Math.floor(fromBase(targetBase, unit));
  } else {
    const decimals = COARSE_UNITS.has(unit) ? 0 : 2;
    const factor = 10 ** decimals;
    quantity = Math.floor(fromBase(targetBase, unit) * factor) / factor;
  }

  if (quantity <= 0 || toBase(quantity, unit) > line.baseRemaining + EPSILON) return null;
  return { line, quantity, unit };
}

const SLOT_DISH_EN: Record<MealSlot, string> = {
  breakfast: 'Breakfast Bowl',
  lunch: 'Skillet',
  dinner: 'Stew',
  snack: 'Plate',
};

const SLOT_DISH_AR: Record<MealSlot, string> = {
  breakfast: 'طبق فطور',
  lunch: 'صحن',
  dinner: 'يخنة',
  snack: 'طبق خفيف',
};

function joinList(names: string[], locale: 'en' | 'ar'): string {
  if (names.length <= 1) return names[0] ?? '';
  const sep = locale === 'ar' ? ' و' : ', ';
  const head = names.slice(0, -1).join(sep);
  const tail = names[names.length - 1]!;
  return locale === 'ar' ? `${head} و${tail}` : `${head} and ${tail}`;
}

function buildRecipe(
  ctx: PlanPromptContext,
  slot: MealSlot,
  chosen: ChosenIngredient[],
  usedTitles: Set<string>,
): GeneratedRecipe {
  const ar = ctx.locale === 'ar';
  const displayNames = chosen.map((c) => (ar ? c.line.nameAr : c.line.nameEn));
  const main = displayNames[0]!;
  const rest = displayNames.slice(1);

  let title = ar ? `${SLOT_DISH_AR[slot]} ${main} بيتي` : `Home-Style ${main} ${SLOT_DISH_EN[slot]}`;
  if (usedTitles.has(normalize(title)) && rest.length > 0) {
    title = ar
      ? `${SLOT_DISH_AR[slot]} ${main} و${rest[0]}`
      : `Home-Style ${main} and ${rest[0]} ${SLOT_DISH_EN[slot]}`;
  }
  let suffix = 2;
  const base = title;
  while (usedTitles.has(normalize(title))) {
    title = ar ? `${base} (${suffix})` : `${base} #${suffix}`;
    suffix += 1;
  }
  usedTitles.add(normalize(title));

  const description = ar
    ? `طبق بسيط محضّر مما يتوفر في مؤنك: ${joinList(displayNames, 'ar')}.`
    : `A simple dish made from what's already in your pantry: ${joinList(displayNames, 'en')}.`;

  const others = rest.length > 0 ? joinList(rest, ar ? 'ar' : 'en') : main;
  const cooks = slot !== 'snack';
  const steps = ar
    ? [
        `جهّزي ${main}${rest.length > 0 ? ` وقطّعي ${others}` : ''}.`,
        cooks
          ? 'اطهي المكوّنات معاً على نار متوسطة حتى تنضج وتتداخل النكهات.'
          : 'اخلطي المكوّنات معاً في وعاء حتى تتجانس.',
        'تبّلي حسب الرغبة وقدّميها طازجة.',
      ]
    : [
        `Prepare the ${main}${rest.length > 0 ? ` and chop the ${others}` : ''}.`,
        cooks
          ? 'Cook everything together over medium heat until tender and the flavours meld.'
          : 'Combine everything in a bowl and toss until evenly mixed.',
        'Season to taste and serve fresh.',
      ];

  return {
    title,
    description,
    cuisine: null,
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: cooks ? 15 : 0,
    servings: ctx.servings,
    ingredients: chosen.map((c) => ({
      name: ar ? c.line.nameAr : c.line.nameEn,
      quantity: c.quantity,
      unit: c.unit,
      optional: false,
    })),
    steps,
    nutritionPerServing: null,
  };
}

/**
 * Synthesize one recipe for `slot` from the working stock, depleting what it
 * uses. Returns `null` when the pantry cannot support a real dish (so callers
 * can let genuine infeasibility surface). Only non-staple ingredients count as
 * "real food"; a pantry of nothing but assumed staples yields `null`.
 */
export function synthesizeRecipe(
  ctx: PlanPromptContext,
  slot: MealSlot,
  stock: WorkingStock,
  usedTitles: Set<string>,
): GeneratedRecipe | null {
  const candidates = selectCandidates(ctx, stock);
  const hasRealFood = candidates.some((line) => !isStapleName(line.nameEn) && !line.isStaple);
  if (!hasRealFood) return null;

  const chosen: ChosenIngredient[] = [];
  for (const line of candidates) {
    const portion = portionFor(line, ctx.servings);
    if (portion) chosen.push(portion);
    if (chosen.length >= MAX_INGREDIENTS) break;
  }
  if (chosen.length === 0) return null;

  for (const c of chosen) consume(stock, c.line.nameEn, c.quantity, c.unit);
  return buildRecipe(ctx, slot, chosen, usedTitles);
}
