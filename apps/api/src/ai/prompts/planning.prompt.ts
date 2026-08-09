import { unitSchema } from '@kitchen/contracts';
import type { PlanPromptContext } from './prompt.types.js';
import {
  type BuiltPrompt,
  localeDirective,
  untrusted,
  untrustedList,
  UNTRUSTED_DATA_DIRECTIVE,
} from './prompt.shared.js';

/**
 * Stage-B planning prompt (spec §5.4). Turns the deterministic pantry snapshot
 * and household constraints into a request for complete recipes as structured
 * output. Validation (Stage C) is deterministic and runs after this — the
 * prompt asks the model to stay within the pantry, but the code, not the model,
 * is the source of truth for feasibility.
 */
export const PLANNING_PROMPT_VERSION = 'planning/v1';

function constraintLines(ctx: PlanPromptContext): string {
  const c = ctx.constraints;
  const lines: string[] = [];
  lines.push(`Household size: ${c.householdSize}. Servings per meal: ${ctx.servings}.`);
  if (c.halal) {
    lines.push(
      'HALAL REQUIRED: never include pork, bacon, ham, lard, gelatin from pork, alcohol, ' +
        'wine, beer, or any spirit — not in ingredients and not in cooking steps.',
    );
  }
  if (c.allergies.length > 0) {
    lines.push(
      `ALLERGIES — never include these or dishes containing them: ${c.allergies.map(untrusted).join(', ')}.`,
    );
  }
  if (c.dietaryPrefs.length > 0) {
    lines.push(`Dietary preferences: ${c.dietaryPrefs.map(untrusted).join(', ')}.`);
  }
  if (c.cuisinePrefs.length > 0) {
    lines.push(`Preferred cuisines: ${c.cuisinePrefs.map(untrusted).join(', ')}.`);
  }
  if (c.excludeNames.length > 0) {
    lines.push(`Avoid these ingredients for this plan: ${c.excludeNames.map(untrusted).join(', ')}.`);
  }
  if (c.maxCookMinutes != null) {
    lines.push(`Keep total cook time at or under ${c.maxCookMinutes} minutes per meal.`);
  }
  return lines.join('\n');
}

function pantryBlock(ctx: PlanPromptContext): string {
  if (ctx.pantry.length === 0) return '(pantry is empty)';
  return ctx.pantry
    .map((p) => {
      const expiry = p.expiresOn ? `, expires ${p.expiresOn}` : '';
      const staple = p.isStaple ? ' [staple]' : '';
      // The English name is shown even in an Arabic plan, because the recipe
      // must echo it back as `nameEn` to join the catalog. Asking the model to
      // copy a name the prompt never showed it is how the last three failures
      // happened.
      const en =
        p.nameEn && normalizeForCompare(p.nameEn) !== normalizeForCompare(p.name)
          ? ` (${untrusted(p.nameEn)})`
          : '';
      return `- ${untrusted(p.name)}${en}: ${p.quantity} ${p.unit}${expiry}${staple}`;
    })
    .join('\n');
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The exact output shape, field by field.
 *
 * The previous version of this prompt asked for `{"entries":[{"date","slot",
 * "recipe":{...}}]}` and left `{...}` to the model's imagination. Every real
 * gpt-5 failure traced back to that one ellipsis: `difficulty` came back
 * translated into Arabic, `nutritionPerServing` and `cuisine` were dropped
 * entirely, and `steps` arrived as objects rather than strings. Each cost two
 * full-priced calls, because the repair attempt was given the same unspecified
 * shape and guessed differently the second time.
 *
 * A schema the model cannot see is a schema the model cannot satisfy.
 */
const RECIPE_SHAPE = [
  'Return exactly this JSON shape, with no extra fields:',
  '{"entries":[{"date":"YYYY-MM-DD","slot":"breakfast|lunch|dinner|snack","recipe":{',
  '  "title": string,',
  '  "description": string,',
  '  "cuisine": string or null,',
  '  "difficulty": "easy" | "medium" | "hard",',
  '  "prepMinutes": integer >= 0,',
  '  "cookMinutes": integer >= 0,',
  '  "servings": integer > 0,',
  `  "ingredients": [{"name": string, "nameEn": string, "quantity": number, "unit": ${JSON.stringify(
    unitSchema.options.join('|'),
  )}, "optional": boolean}],`,
  '  "steps": [string, string, ...],',
  '  "nutritionPerServing": {"calories":number,"proteinG":number,"carbsG":number,"fatG":number} or null',
  '}}]}',
  'Every ingredient needs a numeric quantity and a unit from that list. "steps" is an array of ' +
    'plain strings — one instruction per string, in order. Never wrap a step in an object. ' +
    'Include every key listed above on every recipe, using null where a value is unknown.',
  // "name" is shown to the user; "nameEn" is the join key into a global,
  // English-seeded catalog. Conflating them made every Arabic plan mint a
  // duplicate ingredient, which broke pantry matching for the household that
  // owned the food.
  'For each ingredient, "name" is displayed to the user in the requested language, and ' +
    '"nameEn" is the plain English name of the same ingredient, always in Latin script — ' +
    'for example {"name": "جبن فيتا", "nameEn": "Feta cheese"}. When the ingredient is one of ' +
    'the pantry items above, copy the English name shown in parentheses there into "nameEn" ' +
    'exactly, character for character. Never omit "nameEn" and never write it in Arabic.',
].join('\n');

/**
 * What the planner does with a recipe that needs something the pantry lacks
 * differs by scope, and the prompt has to say so.
 *
 * A daily plan must be cookable tonight, so it really is pantry-only. Weekly
 * and monthly plans are not: the core deliberately accepts shortfalls and
 * aggregates them into the shopping list. Telling those the same "use only
 * pantry ingredients" left the model with no legal move once forward-simulated
 * consumption emptied the pantry mid-week, and rather than reach past it, real
 * gpt-5 kept obeying — day 3 of a real weekly plan came back as "warm water
 * with olive oil" and "water soup with olive oil". Plausible-looking output,
 * schema-valid, and useless.
 */
function sourcingRule(ctx: PlanPromptContext): string {
  if (ctx.scope === 'daily') {
    return (
      'Sourcing: this plan must be cookable right now. Use only the pantry above plus ' +
      'basic staples (salt, pepper, oil, water, common dried spices). Do not use anything else.'
    );
  }
  return (
    'Sourcing: prefer the pantry above, and lean on it heavily for the earliest days. ' +
    'The pantry list shrinks as the plan consumes it, so later days will show less — that is ' +
    'expected, not a signal to pad recipes out with water or oil. For later days you may add a ' +
    'few ordinary ingredients the household does not have yet; they are collected onto a ' +
    'shopping list automatically. Every meal must still be a real dish someone would want to ' +
    'eat. Never invent a filler recipe to satisfy a slot.'
  );
}

export function buildPlanningPrompt(ctx: PlanPromptContext): BuiltPrompt {
  const system = [
    'You are a household meal planner. You design real, cookable meals grounded strictly in ' +
      'the ingredients a household already has.',
    localeDirective(ctx.locale),
    RECIPE_SHAPE,
    'Ingredient names must be common catalog names (e.g. "Chicken breast", "Basmati rice"), ' +
      'not brands.',
    `Rules: prefer ingredients that expire soonest. A single recipe may appear at most ` +
      `${ctx.maxRepeatsPerWeek} times per 7 days. Honour every dietary, allergy and halal ` +
      `constraint absolutely.`,
    sourcingRule(ctx),
    UNTRUSTED_DATA_DIRECTIVE,
  ].join('\n\n');

  const targets = ctx.dates
    .map((date) => `${date}: ${ctx.slots.join(', ')}`)
    .join('\n');

  const user = [
    `Scope: ${ctx.scope}.`,
    `Fill these date/slot targets:\n${targets}`,
    `Constraints:\n${constraintLines(ctx)}`,
    `Pantry (deterministic snapshot, soonest-to-expire first):\n${pantryBlock(ctx)}`,
    ctx.alreadyUsedTitles.length > 0
      ? `Already used earlier in this plan (avoid repeating):\n${untrustedList(ctx.alreadyUsedTitles)}`
      : '',
    ctx.note ? `User note for this request: ${untrusted(ctx.note)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user, version: PLANNING_PROMPT_VERSION };
}
