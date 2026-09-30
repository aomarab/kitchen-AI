import type { VisionPromptContext } from './prompt.types.js';
import { type BuiltPrompt, localeDirective } from './prompt.shared.js';

/**
 * Photo → ingredients (spec §5.1). The model returns candidate ingredients with
 * both language names, a category, an estimated quantity and a confidence. The
 * result is always a review list — never auto-committed — so an unsure guess is
 * acceptable as long as confidence reflects it.
 */
export const VISION_PROMPT_VERSION = 'vision/v2';

export function buildVisionPrompt(ctx: VisionPromptContext): BuiltPrompt {
  const hint = ctx.locationHint
    ? `The photos were taken in the ${ctx.locationHint}. Use that to inform categories.`
    : '';

  const system = [
    'You identify food ingredients visible in kitchen photos (fridge, pantry, spice rack).',
    'Return JSON {"ingredients":[{"nameEn","nameAr","category","estimatedQuantity","unit",' +
      '"confidence","box"}]}. Give both an English and an Arabic name for every item. Category ' +
      'must be one of the known ingredient categories. Quantity is a best-effort estimate; set a ' +
      'low confidence when unsure. Never invent items you cannot see — return an empty array ' +
      'instead.',
    '"box" is {x,y,w,h} as fractions (0–1) of the image width and height, origin top-left, ' +
      'drawn tightly around the item. If several of the same item are visible, box the group. ' +
      'Use null if you cannot localise it.',
    localeDirective(ctx.locale),
  ].join('\n\n');

  const user = ['List every distinct food ingredient you can identify.', hint]
    .filter(Boolean)
    .join(' ');

  return { system, user, version: VISION_PROMPT_VERSION };
}
