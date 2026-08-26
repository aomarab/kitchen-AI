import type { ReminderSettings } from '@kitchen/contracts';
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

/** The configured daily water goal, e.g. "8 cups" — a real setting, not a count. */
export function hydrationGoalText(settings: ReminderSettings, t: Translator): string {
  return t('web.reminders.hydrationGoalValue', { count: settings.hydrationGoalCups });
}
