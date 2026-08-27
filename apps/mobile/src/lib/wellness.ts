import {
  hydrationCupsDrunk,
  pendingNudges,
  REMINDER_MESSAGE_KEYS,
  type ReminderOccurrence,
  type ReminderSettings,
  type ReminderType,
} from '@kitchen/contracts';

/** One row on the wellness screen. */
export interface NudgeRow {
  id: string;
  type: ReminderType;
  messageKey: string;
  firedAt: string;
  /** Null while the nudge is still owed an answer. */
  acknowledgedAt: string | null;
}

/**
 * The list the screen renders: everything still owed an answer, newest first,
 * followed by what has already been dealt with, also newest first.
 *
 * Both halves are shown rather than only the outstanding ones, because a day
 * where every nudge was answered would otherwise render as an empty screen —
 * indistinguishable from a day the engine never fired at all. Those are very
 * different facts and the screen must not conflate them.
 */
export function nudgeRows(occurrences: ReminderOccurrence[]): NudgeRow[] {
  const outstanding = pendingNudges(occurrences);
  const done = occurrences
    .filter((o) => o.acknowledgedAt !== null)
    .sort((a, b) => (a.firedAt < b.firedAt ? 1 : a.firedAt > b.firedAt ? -1 : 0));
  return [...outstanding, ...done].map((o) => ({
    id: o.id,
    type: o.type,
    messageKey: o.messageKey || REMINDER_MESSAGE_KEYS[o.type],
    firedAt: o.firedAt,
    acknowledgedAt: o.acknowledgedAt,
  }));
}

/** How many nudges are still owed an answer — the badge on the entry row. */
export function outstandingCount(occurrences: ReminderOccurrence[]): number {
  return pendingNudges(occurrences).length;
}

/**
 * Hydration progress as a fraction of the goal, clamped to 1.
 *
 * Clamped because a household can acknowledge more cups than its goal — the
 * engine stops *nudging* at the goal but never refuses an acknowledgement — and
 * a progress bar wider than its track is a rendering bug, not a reward.
 */
export function hydrationFraction(
  occurrences: ReminderOccurrence[],
  settings: ReminderSettings,
): number {
  if (settings.hydrationGoalCups <= 0) return 0;
  return Math.min(1, hydrationCupsDrunk(occurrences) / settings.hydrationGoalCups);
}

/**
 * Minutes since a nudge fired, floored at 0.
 *
 * Floored because clock skew between the phone and the server can put `firedAt`
 * slightly in the future, and "fired -1 minutes ago" is worse than "just now".
 */
export function minutesSinceFired(firedAt: string, now: Date): number {
  const delta = now.getTime() - new Date(firedAt).getTime();
  return Math.max(0, Math.floor(delta / 60_000));
}
