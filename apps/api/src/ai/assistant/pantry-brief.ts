import type { Locale } from '@kitchen/contracts';
import { fromBase } from '../planner/units.js';
import { pantryLinesByExpiry } from '../planner/pantry-snapshot.js';
import type { PantrySnapshot } from '../planner/types.js';

/**
 * Renders the Stage-A pantry snapshot as session context for the live assistant
 * (kitchen companion spec — Feature 5).
 *
 * This is the same deterministic snapshot the planner uses; the assistant does
 * not get its own inventory reader, because two readers would eventually
 * disagree and the assistant would contradict the meal plan.
 *
 * Pure, so it is unit-tested without a database.
 */

/**
 * How many pantry lines the brief carries.
 *
 * The instructions are sent on every mint and are charged for, so the list has
 * to be bounded — a household with three hundred tracked items would otherwise
 * pay for three hundred lines every time it opened the assistant. Expiry-first
 * ordering means the cut falls on the items least likely to come up in "what
 * should I cook tonight".
 */
export const MAX_PANTRY_LINES = 60;

/**
 * Builds the pantry section of the session instructions.
 *
 * The wording carries two disclaimers that are load-bearing rather than
 * decorative:
 *
 * 1. The list is what the household *tracks*, not everything they own. Without
 *    this the model reads an absent ingredient as an absent ingredient and
 *    tells the user they cannot cook something they can see on their counter.
 * 2. When the list was truncated it says so, and by how much. A partial list
 *    presented as complete is the same failure with a worse cause, because
 *    nothing on screen would hint at it.
 */
export function pantryBrief(snapshot: PantrySnapshot, locale: Locale): string {
  const entries = pantryLinesByExpiry(snapshot);
  const shown = entries.slice(0, MAX_PANTRY_LINES);
  const omitted = entries.length - shown.length;

  const lines = shown.map((entry) => {
    const name = locale === 'ar' ? entry.nameAr : entry.nameEn;
    // Base units are grams and millilitres; a brief that says "2000 g of milk"
    // instead of "2 l" reads as a different quantity to a language model.
    const quantity = Math.round(fromBase(entry.baseQuantity, entry.displayUnit) * 100) / 100;
    const expiry = entry.expiresOn ? ` (expires ${entry.expiresOn})` : '';
    return `- ${name}: ${quantity} ${entry.displayUnit}${expiry}`;
  });

  if (locale === 'ar') {
    if (lines.length === 0) {
      return 'مخزون المطبخ المسجَّل فارغ حاليًا. لا تفترضي أن المستخدم لا يملك شيئًا — قد تكون لديه أغراض غير مسجَّلة، فاسأليه.';
    }
    return [
      'هذه هي الأغراض المسجَّلة في مخزون المطبخ، الأقرب انتهاءً أولًا:',
      ...lines,
      omitted > 0 ? `وهناك ${omitted} صنفًا آخر غير مذكور هنا؛ قائمتك غير كاملة.` : '',
      'هذه قائمة ما هو مسجَّل فقط، وليست كل ما يملكه المستخدم. لا تقولي إنه لا يملك صنفًا لمجرد غيابه عن القائمة — اسأليه.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (lines.length === 0) {
    return 'The tracked pantry is currently empty. Do not assume the user has nothing — they may have untracked items, so ask.';
  }
  return [
    'These are the items tracked in the kitchen pantry, soonest to expire first:',
    ...lines,
    omitted > 0
      ? `There are ${omitted} more tracked items not listed here; your list is partial.`
      : '',
    'This lists only what is tracked, not everything the user owns. Do not tell them they lack an item just because it is missing from this list — ask instead.',
  ]
    .filter(Boolean)
    .join('\n');
}
