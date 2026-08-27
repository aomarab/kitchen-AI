import {
  hydrationCupsDrunk,
  pendingNudge,
  projectTimer,
  scheduledReminderTypes,
  type CookingTimer,
  type ReminderOccurrence,
  type ReminderSettings,
} from '@kitchen/contracts';
import type { Translator } from '@kitchen/i18n';
import { sortTimers } from './timers';

/**
 * The kitchen kiosk: the phone or tablet propped on the counter.
 *
 * Everything here is pure so it can be tested — mobile has no render harness,
 * so logic that lives inside a component is logic nobody checks. The screen
 * itself is then a thin arrangement of these values.
 *
 * It deliberately mirrors `apps/web/src/lib/screen.ts` in behaviour but not in
 * code: the two read different i18n namespaces (`mobile.*` vs `web.*`), and
 * the shared part — which nudges are schedulable, which one is outstanding,
 * how many cups count — already lives in `@kitchen/contracts`, where both
 * surfaces read it from. Duplicating *that* is what would let the kiosk and
 * the phone disagree.
 */

/**
 * Orientation from the window, not from the orientation API.
 *
 * The API says what the device is *allowed* to do and answers asynchronously;
 * the window says what the user is actually looking at, and re-renders when it
 * changes. A square window counts as portrait — an arbitrary tie-break, but a
 * total one, so the layout can never be undefined.
 */
export function kioskOrientation(width: number, height: number): 'landscape' | 'portrait' {
  return width > height ? 'landscape' : 'portrait';
}

/**
 * The hero summary: one line per nudge that is both switched on *and*
 * schedulable, in the order the contract lists them.
 *
 * Driven by `scheduledReminderTypes` rather than by reading the toggles, so
 * the kiosk cannot promise a nudge the engine will not send. The switch is
 * exhaustive on purpose — a new reminder type fails to compile until it is
 * given a line, rather than silently rendering as the last branch.
 */
export function wellnessPlanLines(settings: ReminderSettings, t: Translator): string[] {
  const every = (minutes: number) => t('mobile.reminders.cadenceEvery', { minutes });
  return scheduledReminderTypes(settings).map((type) => {
    switch (type) {
      case 'break':
        return `${t('mobile.reminders.breakLabel')} · ${every(settings.breakCadenceMinutes)}`;
      case 'stretch':
        return `${t('mobile.reminders.stretchLabel')} · ${every(settings.stretchCadenceMinutes)}`;
      case 'morning':
        return t('mobile.reminders.morningLabel');
      case 'hydration':
        return t('mobile.reminders.hydrationLabel');
    }
  });
}

/** True when the household has at least one nudge the engine can actually fire. */
export function hasAnyNudge(settings: ReminderSettings): boolean {
  return scheduledReminderTypes(settings).length > 0;
}

/**
 * The nudge the kiosk should be asking about. Delegates to the contract so the
 * kiosk and the phone can never disagree about which occurrence is
 * outstanding: acknowledging on one has to clear the same row on the other.
 */
export function activeNudge(occurrences: ReminderOccurrence[]): ReminderOccurrence | null {
  return pendingNudge(occurrences);
}

/**
 * The one timer worth a whole panel, already projected onto `now`.
 *
 * `sortTimers` puts whatever needs a hand first — finished, then soonest to
 * finish, then paused — so the kiosk simply takes the head of that list rather
 * than inventing a second ordering the timers screen would disagree with.
 */
export function featuredTimer(timers: readonly CookingTimer[], now: Date): CookingTimer | null {
  return sortTimers(timers, now)[0] ?? null;
}

/**
 * Cups **acknowledged** today against the goal. A nudge nobody acted on is not
 * a drink, so this can never be derived from how many nudges were sent.
 */
export function hydrationProgressText(
  occurrences: ReminderOccurrence[],
  settings: ReminderSettings,
  t: Translator,
): string {
  return t('mobile.screen.hydrationProgress', {
    count: hydrationCupsDrunk(occurrences),
    goal: settings.hydrationGoalCups,
  });
}

/**
 * Should the kiosk's one-second tick be running?
 *
 * Only while a timer is actually counting down. A kiosk is left open for
 * hours, and this screen also holds the device awake — a tick that never stops
 * would keep the CPU busy for the whole time the food is in the oven.
 */
export function needsTick(timers: readonly CookingTimer[], now: Date): boolean {
  return timers.some((timer) => projectTimer(timer, now).status === 'running');
}
