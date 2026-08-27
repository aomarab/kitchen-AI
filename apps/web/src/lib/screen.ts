import {
  hydrationCupsDrunk,
  pendingNudge,
  scheduledReminderTypes,
  type ReminderOccurrence,
  type ReminderSettings,
} from '@kitchen/contracts';
import type { Translator } from '@kitchen/i18n';

/**
 * True when at least one wellness nudge is switched on *and* the engine can
 * fire it.
 *
 * Switched-on is not enough. A household with only stretch enabled used to
 * see a wellness plan on the kitchen screen, and would then wait all day for
 * a nudge the firing engine is documented never to produce.
 */
export function hasAnyNudge(settings: ReminderSettings): boolean {
  return scheduledReminderTypes(settings).length > 0;
}

/**
 * The hero summary shown on the kitchen screen: one line per nudge that is
 * both switched on and schedulable, in the order the contract lists them.
 *
 * Driven by `scheduledReminderTypes` rather than by reading the toggles
 * directly, so this screen cannot promise a nudge the engine will not send.
 */
export function wellnessPlanLines(settings: ReminderSettings, t: Translator): string[] {
  return scheduledReminderTypes(settings).map((type) => {
    if (type === 'break') {
      return `${t('web.reminders.breakLabel')} · ${t('web.reminders.cadenceEvery', {
        minutes: settings.breakCadenceMinutes,
      })}`;
    }
    if (type === 'morning') return t('web.reminders.morningLabel');
    return t('web.reminders.hydrationLabel');
  });
}

/**
 * The real hydration line: cups **acknowledged** today against the goal. A
 * nudge nobody acted on is not a drink, so the count comes from
 * `hydrationCupsDrunk`, never from how many nudges were sent.
 */
export function hydrationProgressText(
  occurrences: ReminderOccurrence[],
  settings: ReminderSettings,
  t: Translator,
): string {
  return t('web.screen.hydrationProgress', {
    count: hydrationCupsDrunk(occurrences),
    goal: settings.hydrationGoalCups,
  });
}

/**
 * The nudge the screen should be showing. Delegates to the contract's
 * `pendingNudge` so the kiosk and the phone can never disagree about which
 * occurrence is outstanding.
 */
export function activeNudge(occurrences: ReminderOccurrence[]): ReminderOccurrence | null {
  return pendingNudge(occurrences);
}
