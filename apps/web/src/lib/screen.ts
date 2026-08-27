import {
  hydrationCupsDrunk,
  type ReminderOccurrence,
  type ReminderSettings,
} from '@kitchen/contracts';
import type { Translator } from '@kitchen/i18n';

/** True when at least one wellness nudge is switched on. */
export function hasAnyNudge(settings: ReminderSettings): boolean {
  return (
    settings.breakEnabled ||
    settings.stretchEnabled ||
    settings.morningEnabled ||
    settings.hydrationEnabled
  );
}

/**
 * The hero summary shown on the kitchen screen: one line per enabled nudge,
 * derived only from the household's real reminder settings. There is no live
 * firing engine yet, so this is an honest "here is what is on" plan — never a
 * fabricated in-progress alert.
 */
export function wellnessPlanLines(settings: ReminderSettings, t: Translator): string[] {
  const lines: string[] = [];
  if (settings.breakEnabled) {
    lines.push(
      `${t('web.reminders.breakLabel')} · ${t('web.reminders.cadenceEvery', {
        minutes: settings.breakCadenceMinutes,
      })}`,
    );
  }
  if (settings.stretchEnabled) lines.push(t('web.reminders.stretchLabel'));
  if (settings.morningEnabled) lines.push(t('web.reminders.morningLabel'));
  if (settings.hydrationEnabled) lines.push(t('web.reminders.hydrationLabel'));
  return lines;
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
 * The nudge the screen should be showing: the most recent one the household
 * has not acknowledged yet. Returns null when everything has been dealt with,
 * so the kiosk shows the plan rather than inventing an alert.
 */
export function activeNudge(occurrences: ReminderOccurrence[]): ReminderOccurrence | null {
  const pending = occurrences.filter((o) => o.acknowledgedAt === null);
  if (pending.length === 0) return null;
  return pending.reduce((latest, o) => (o.firedAt > latest.firedAt ? o : latest));
}
