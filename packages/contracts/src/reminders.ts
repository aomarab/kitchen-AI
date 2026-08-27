import { z } from 'zod';
import { uuidSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Wellness reminders — settings (design spec §92–98)                  */
/* ------------------------------------------------------------------ */

/** The four nudge types the wellness engine can fire. Spec §96. */
export const reminderTypeSchema = z.enum(['break', 'stretch', 'morning', 'hydration']);
export type ReminderType = z.infer<typeof reminderTypeSchema>;

/** Break cadence is one of four fixed intervals, in minutes. Spec §96. */
export const breakCadenceMinutesSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(90),
  z.literal(120),
]);
export type BreakCadenceMinutes = z.infer<typeof breakCadenceMinutesSchema>;

/**
 * Stretch cadence, in minutes. Same four intervals as the break cadence
 * because they are the same kind of choice, but a *separate* setting: a break
 * is "stop working", a stretch is "move your body", and a household that wants
 * hourly breaks does not necessarily want hourly stretches.
 *
 * Its existence is what lets the engine fire `stretch` at all. Until it was
 * added the type was declared and never scheduled, and the UI promised a nudge
 * that could not arrive.
 */
export const stretchCadenceMinutesSchema = breakCadenceMinutesSchema;
export type StretchCadenceMinutes = z.infer<typeof stretchCadenceMinutesSchema>;

export const reminderSettingsSchema = z.object({
  householdId: uuidSchema,
  breakEnabled: z.boolean().default(true),
  stretchEnabled: z.boolean().default(true),
  morningEnabled: z.boolean().default(true),
  hydrationEnabled: z.boolean().default(true),
  breakCadenceMinutes: breakCadenceMinutesSchema.default(60),
  /**
   * Stretch cadence. Defaults to 90 rather than the break's 60 so the two do
   * not sit on top of each other for a household that changes neither.
   */
  stretchCadenceMinutes: stretchCadenceMinutesSchema.default(90),
  /** Cups of water per day. */
  hydrationGoalCups: z.number().int().min(1).max(20).default(8),
  /** Quiet-hours window as whole hours 0–23; nudges are suppressed inside it. */
  quietHoursStart: z.number().int().min(0).max(23).default(22),
  quietHoursEnd: z.number().int().min(0).max(23).default(7),
  /**
   * IANA zone the quiet hours are expressed in. Quiet hours are wall-clock
   * hours, so they are meaningless without one — a household in Amman that
   * sleeps at 22:00 must not be woken because the server counts in UTC.
   * `'UTC'` is the honest "not told yet" value, not a guess at the user's zone;
   * clients send `Intl.DateTimeFormat().resolvedOptions().timeZone`.
   */
  timeZone: z.string().min(1).max(64).default('UTC'),
});
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export const updateReminderSettingsRequestSchema = reminderSettingsSchema
  .omit({ householdId: true })
  .partial();
export type UpdateReminderSettingsRequest = z.infer<typeof updateReminderSettingsRequestSchema>;

/* ------------------------------------------------------------------ */
/* Wellness reminders — the fired-occurrence ledger (spec §92–98)      */
/* ------------------------------------------------------------------ */

/**
 * How a fired nudge reached the household. Only `screen` exists today: the
 * engine writes the occurrence and clients poll for it. `push` and spoken
 * delivery are Feature 4 and are deliberately absent from this enum rather
 * than declared and unimplemented.
 */
export const reminderChannelSchema = z.enum(['screen']);
export type ReminderChannel = z.infer<typeof reminderChannelSchema>;

/**
 * One fired nudge. `messageKey` is an i18n key, never prose: the server does
 * not send user-facing text (same rule as `AppError`), so the client and any
 * future TTS render it in the household's language.
 */
export const reminderOccurrenceSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  type: reminderTypeSchema,
  channel: reminderChannelSchema,
  messageKey: z.string().min(1),
  firedAt: z.string(),
  /** Set when the household confirms it acted on the nudge (drank the cup). */
  acknowledgedAt: z.string().nullable(),
});
export type ReminderOccurrence = z.infer<typeof reminderOccurrenceSchema>;

export const reminderOccurrenceListSchema = z.array(reminderOccurrenceSchema);

/**
 * Occurrences are read per waking day, which is what the kiosk needs to say
 * "3 of 8 cups". `since` defaults to the start of the current waking window on
 * the server.
 */
export const listReminderOccurrencesQuerySchema = z.object({
  since: z.string().datetime().optional(),
});
export type ListReminderOccurrencesQuery = z.infer<typeof listReminderOccurrencesQuerySchema>;

/** The i18n key each nudge type renders through. Spec: `reminders.break.body`. */
export const REMINDER_MESSAGE_KEYS = {
  break: 'reminders.break.body',
  stretch: 'reminders.stretch.body',
  morning: 'reminders.morning.body',
  hydration: 'reminders.hydration.body',
} as const satisfies Record<ReminderType, string>;

/* ------------------------------------------------------------------ */
/* Wellness reminders — the pure scheduling core                       */
/* ------------------------------------------------------------------ */

const MINUTES_PER_DAY = 1440;

/**
 * The household's wall-clock minute-of-day. Uses `Intl` (present in Node and
 * every browser) rather than a date library, and `hourCycle: 'h23'` so
 * midnight is hour 0 and not 24.
 */
export function localMinuteOfDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/**
 * Is `hour` inside the quiet window? The window wraps midnight (22 → 7). A
 * window where start equals end is **empty**, not all-day: a user who has not
 * chosen quiet hours should still get nudges.
 */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** Length of the waking window in minutes, i.e. quiet-hours end → start. */
export function wakingWindowMinutes(settings: ReminderSettings): number {
  const start = settings.quietHoursEnd * 60;
  const end = settings.quietHoursStart * 60;
  if (start === end) return MINUTES_PER_DAY;
  return (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Minutes elapsed since the household woke, i.e. since the local clock last
 * passed `quietHoursEnd`. Everything else is derived from this so no
 * local-date → UTC conversion is ever needed: the waking instant is simply
 * `now` minus this many minutes.
 */
export function minutesSinceWaking(settings: ReminderSettings, now: Date): number {
  const local = localMinuteOfDay(now, settings.timeZone);
  return (local - settings.quietHoursEnd * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** The instant the current waking window began. */
export function wakingStart(settings: ReminderSettings, now: Date): Date {
  return new Date(now.getTime() - minutesSinceWaking(settings, now) * 60_000);
}

/**
 * How far apart hydration nudges must be so `hydrationGoalCups` cups fit in the
 * waking window — the prototype's "8 cups spread over the day". Derived from
 * the two real settings; no interval is invented.
 *
 * The window is divided into `goal + 1` gaps, not `goal`. Dividing by the goal
 * puts the last cup exactly at the start of quiet hours, where it is suppressed
 * — so the goal would be unreachable by construction. With `goal + 1` the cups
 * sit strictly inside the waking window and the last one still lands a full
 * interval before bedtime.
 */
export function hydrationIntervalMinutes(settings: ReminderSettings): number {
  return Math.max(1, Math.floor(wakingWindowMinutes(settings) / (settings.hydrationGoalCups + 1)));
}

/** What the firing sweep needs to know about what has already fired today. */
export interface FiredState {
  /** Last fire instant per type within the current waking window, if any. */
  lastFiredAt: Partial<Record<ReminderType, Date>>;
  /** Count per type within the current waking window. */
  countToday: Partial<Record<ReminderType, number>>;
}

/**
 * Which nudges are due right now.
 *
 * Break and stretch run on independent clocks and are allowed to fall due in
 * the same sweep. They are not deduplicated: they ask for different things
 * (stop working vs. move your body), and silently dropping one would make a
 * cadence the household chose not happen.
 */
export function dueReminderTypes(
  settings: ReminderSettings,
  state: FiredState,
  now: Date,
): ReminderType[] {
  const local = localMinuteOfDay(now, settings.timeZone);
  if (isQuietHour(Math.floor(local / 60), settings.quietHoursStart, settings.quietHoursEnd)) {
    return [];
  }

  const sinceWaking = minutesSinceWaking(settings, now);
  const elapsed = (type: ReminderType): number | null => {
    const last = state.lastFiredAt[type];
    return last ? (now.getTime() - last.getTime()) / 60_000 : null;
  };
  const due: ReminderType[] = [];

  // Morning: once per waking day, as soon as quiet hours end.
  if (settings.morningEnabled && (state.countToday.morning ?? 0) === 0) {
    due.push('morning');
  }

  // Break: every `breakCadenceMinutes`, counted from waking when none has
  // fired yet in this window.
  if (settings.breakEnabled) {
    const since = elapsed('break') ?? sinceWaking;
    if (since >= settings.breakCadenceMinutes) due.push('break');
  }

  // Stretch: every `stretchCadenceMinutes`, on its own clock, counted from
  // waking when none has fired yet in this window.
  if (settings.stretchEnabled) {
    const since = elapsed('stretch') ?? sinceWaking;
    if (since >= settings.stretchCadenceMinutes) due.push('stretch');
  }

  // Hydration: `hydrationGoalCups` evenly spaced, and never more than the goal.
  if (settings.hydrationEnabled && (state.countToday.hydration ?? 0) < settings.hydrationGoalCups) {
    const since = elapsed('hydration') ?? sinceWaking;
    if (since >= hydrationIntervalMinutes(settings)) due.push('hydration');
  }

  return due;
}

/**
 * The reminder types the firing engine is actually able to schedule.
 *
 * This list used to omit `stretch`, because nothing determined its cadence and
 * the engine therefore never fired it — while the UI kept offering a toggle,
 * promising a nudge that could not arrive. `stretchCadenceMinutes` closed that
 * gap, so the type belongs here now.
 *
 * `reminders.spec.ts` cross-checks this list against `dueReminderTypes` under
 * a sweep of settings, so the two cannot drift apart: adding a type here
 * without a branch in the engine fails, and so does removing a branch without
 * removing it here.
 */
export const SCHEDULED_REMINDER_TYPES = ['morning', 'break', 'stretch', 'hydration'] as const;

/** Whether the firing engine can ever produce this type. */
export function isScheduledReminderType(type: ReminderType): boolean {
  return (SCHEDULED_REMINDER_TYPES as readonly ReminderType[]).includes(type);
}

/**
 * The types a household has switched on *and* the engine can act on.
 *
 * This is what a UI should describe as the wellness plan. An enabled toggle
 * the engine ignores is not a plan; it is a promise nothing will keep.
 */
export function scheduledReminderTypes(settings: ReminderSettings): ReminderType[] {
  const enabled: Record<ReminderType, boolean> = {
    morning: settings.morningEnabled,
    break: settings.breakEnabled,
    hydration: settings.hydrationEnabled,
    stretch: settings.stretchEnabled,
  };
  return SCHEDULED_REMINDER_TYPES.filter((type) => enabled[type]);
}

/** Cups actually drunk today — acknowledged hydration nudges, not fired ones. */
export function hydrationCupsDrunk(occurrences: ReminderOccurrence[]): number {
  return occurrences.filter((o) => o.type === 'hydration' && o.acknowledgedAt !== null).length;
}

/**
 * The one nudge a surface should be asking about: the most recently fired
 * occurrence nobody has acknowledged. `null` when everything has been dealt
 * with, so a client shows its idle state rather than inventing an alert.
 *
 * This lives in the contract, not in a client, because the kiosk and the phone
 * must agree on *which* nudge is outstanding — acknowledging on one surface has
 * to clear the same row on the other.
 */
export function pendingNudge(occurrences: ReminderOccurrence[]): ReminderOccurrence | null {
  let latest: ReminderOccurrence | null = null;
  for (const occurrence of occurrences) {
    if (occurrence.acknowledgedAt !== null) continue;
    if (latest === null || occurrence.firedAt > latest.firedAt) latest = occurrence;
  }
  return latest;
}

/**
 * Every unacknowledged nudge, newest first. The phone lists them instead of
 * showing only one, because a nudge that fired while the app was closed is
 * still owed an answer.
 */
export function pendingNudges(occurrences: ReminderOccurrence[]): ReminderOccurrence[] {
  return occurrences
    .filter((o) => o.acknowledgedAt === null)
    .sort((a, b) => (a.firedAt < b.firedAt ? 1 : a.firedAt > b.firedAt ? -1 : 0));
}
