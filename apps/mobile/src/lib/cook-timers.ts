import {
  MAX_TIMER_DURATION_SEC,
  MAX_TIMER_LABEL_LENGTH,
  type CookingTimer,
  type CreateTimerRequest,
} from '@kitchen/contracts';

/**
 * Starting a cooking timer from the step you are reading.
 *
 * Cook mode holds a wake lock and shows one step at a time, so it is where
 * someone actually stands while cooking. Until now a step that said "simmer
 * for 12 minutes" was static text: setting a timer for it meant leaving cook
 * mode — losing the wake lock and your place in the recipe — to type the
 * label and the duration in by hand on another screen.
 *
 * Everything here is pure so it can be tested; mobile has no render harness.
 */

/** Separates the recipe name from the step marker in a generated label. */
const SEPARATOR = ' · ';

/**
 * A label that says which step it belongs to, even for a long recipe name.
 *
 * The step marker is appended *after* truncation rather than before, because
 * a naive `slice(0, MAX_TIMER_LABEL_LENGTH)` cuts the marker off the end —
 * and two timers reading "Slow-cooked lamb with freekeh and caramelised…"
 * are indistinguishable in a notification, which is exactly when you need to
 * know which pot is asking for you.
 */
export function stepTimerLabel(recipeTitle: string, stepNumber: number, stepWord: string): string {
  const marker = `${stepWord} ${stepNumber}`;
  const room = MAX_TIMER_LABEL_LENGTH - marker.length - SEPARATOR.length;
  const title = recipeTitle.trim();

  // A recipe name so long that nothing is left of it: keep the marker, which
  // is the part that identifies the timer, and drop the name entirely.
  if (room <= 1) return marker.slice(0, MAX_TIMER_LABEL_LENGTH);

  const trimmed = title.length <= room ? title : `${title.slice(0, room - 1).trimEnd()}…`;
  return `${trimmed}${SEPARATOR}${marker}`;
}

/**
 * Why a step cannot have a timer, in the contract's refusal vocabulary.
 *
 * `no_duration` is by far the common case — most steps are not timed — so it
 * is not an error to show, it is the reason the button is absent.
 */
export type StepTimerRefusal = 'no_duration' | 'too_long';

export type StepTimerPlan =
  | { readonly ok: true; readonly body: CreateTimerRequest }
  | { readonly ok: false; readonly reason: StepTimerRefusal };

/**
 * What to send to `createTimer` for the step being read, or why not.
 *
 * Rounds to whole seconds because the contract's `durationSec` is an integer;
 * a recipe that says "1.5 minutes" would otherwise be rejected by the server
 * after the user had already pressed the button.
 */
export function stepTimerPlan(options: {
  recipeTitle: string;
  stepNumber: number;
  stepWord: string;
  durationMinutes: number | null | undefined;
}): StepTimerPlan {
  const { recipeTitle, stepNumber, stepWord, durationMinutes } = options;

  if (durationMinutes === null || durationMinutes === undefined) {
    return { ok: false, reason: 'no_duration' };
  }
  if (!Number.isFinite(durationMinutes)) return { ok: false, reason: 'no_duration' };

  const durationSec = Math.round(durationMinutes * 60);
  if (durationSec < 1) return { ok: false, reason: 'no_duration' };
  if (durationSec > MAX_TIMER_DURATION_SEC) return { ok: false, reason: 'too_long' };

  return {
    ok: true,
    body: { label: stepTimerLabel(recipeTitle, stepNumber, stepWord), durationSec },
  };
}

/**
 * The timer already tracking this step, if there is one.
 *
 * Without this, walking back a step and forward again — or simply pressing
 * twice because the first press was not obviously acknowledged — leaves two
 * timers for one pot, both of which will go off. Matching on the generated
 * label is enough: it is deterministic for a given recipe and step.
 *
 * Finished timers are deliberately *not* matched. Once a step's timer has
 * gone off, starting it again is a real intention — reheating, or a second
 * batch — not an accidental duplicate.
 */
export function existingStepTimer(
  timers: readonly CookingTimer[],
  label: string,
): CookingTimer | null {
  return timers.find((timer) => timer.label === label && timer.status !== 'done') ?? null;
}
