import type { PlanPromptContext } from './prompt.types.js';
import { type BuiltPrompt, localeDirective, numbered } from './prompt.shared.js';

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
      `ALLERGIES — never include these or dishes containing them: ${c.allergies.join(', ')}.`,
    );
  }
  if (c.dietaryPrefs.length > 0) {
    lines.push(`Dietary preferences: ${c.dietaryPrefs.join(', ')}.`);
  }
  if (c.cuisinePrefs.length > 0) {
    lines.push(`Preferred cuisines: ${c.cuisinePrefs.join(', ')}.`);
  }
  if (c.excludeNames.length > 0) {
    lines.push(`Avoid these ingredients for this plan: ${c.excludeNames.join(', ')}.`);
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
      return `- ${p.name}: ${p.quantity} ${p.unit}${expiry}${staple}`;
    })
    .join('\n');
}

export function buildPlanningPrompt(ctx: PlanPromptContext): BuiltPrompt {
  const system = [
    'You are a household meal planner. You design real, cookable meals grounded strictly in ' +
      'the ingredients a household already has.',
    localeDirective(ctx.locale),
    'Return JSON of the form {"entries":[{"date","slot","recipe":{...}}]}. Each recipe must ' +
      'list every ingredient with a numeric quantity and a unit, plus ordered steps. Ingredient ' +
      'names must be common catalog names (e.g. "Chicken breast", "Basmati rice"), not brands.',
    'Rules: prefer ingredients that expire soonest. Use only pantry ingredients plus common ' +
      `staples. A single recipe may appear at most ${ctx.maxRepeatsPerWeek} times per 7 days. ` +
      'Honour every dietary, allergy and halal constraint absolutely.',
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
      ? `Already used earlier in this plan (avoid repeating):\n${numbered(ctx.alreadyUsedTitles)}`
      : '',
    ctx.note ? `User note for this request: ${ctx.note}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user, version: PLANNING_PROMPT_VERSION };
}
