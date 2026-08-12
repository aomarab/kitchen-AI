/**
 * What the phone should buzz about, and when.
 *
 * Pure and calendar-local, like `expiry.ts`, so the decisions can be tested
 * without a native runtime — the native layer in `notification-scheduler.ts`
 * only takes this list and hands it to the OS.
 *
 * These are *local* notifications: the device schedules them itself from data
 * it already has. That means they work with no server, no push credentials and
 * no network, and they keep working while the app is closed. The trade-off is
 * that they can only know what this device knows, which is why the scheduler
 * re-runs whenever the inventory or the plan changes.
 */

import { daysUntilExpiry, todayISODate } from './expiry';

/** Warn this many days before food goes off, unless the user changes it. */
export const DEFAULT_LEAD_DAYS = 2;

/**
 * 7pm. Early enough that there is still an evening to cook in, late enough
 * that the day's shopping has happened. A morning alert about food that
 * expires tomorrow arrives when nobody can act on it.
 */
export const DEFAULT_REMINDER_HOUR = 19;

/**
 * iOS keeps only the first 64 pending local notifications per app and silently
 * discards everything after that, so an unbounded plan does not fail loudly —
 * it just loses whichever ones the OS felt like dropping. Staying under the
 * limit ourselves means we choose what survives: the soonest.
 */
export const MAX_SCHEDULED = 48;

export type NotificationKind = 'expiry' | 'meal' | 'expired' | 'shopping' | 'planning';

/**
 * Which reminders the user actually wants.
 *
 * Passed in whole rather than by handing the planner empty arrays, because
 * two of these read the same data: the expiry warning and the "this has gone
 * off" nudge both come from the inventory, and the planning nudge needs the
 * meal list even when meal reminders are silenced.
 */
export interface NotificationToggles {
  readonly expiry: boolean;
  readonly meals: boolean;
  readonly expired: boolean;
  readonly shopping: boolean;
  readonly planning: boolean;
}

export interface PendingNotification {
  /** Stable within one plan, so the scheduler can diff rather than duplicate. */
  readonly key: string;
  readonly kind: NotificationKind;
  readonly fireAt: Date;
  /** How many items expire — expiry only, `1` for a meal. */
  readonly count: number;
  /** Days from the moment it arrives to the expiry date, so the wording is true. */
  readonly daysUntil: number;
  /** The recipe name — meal only. */
  readonly title?: string;
}

export interface ExpiringItem {
  readonly expiresAt: string | null;
}

export interface PlannedMeal {
  readonly date: string;
  readonly title: string;
}

export interface ShoppingLine {
  readonly purchased: boolean;
}

function atHour(day: Date, hour: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
}

/**
 * The next time today's reminder hour comes around.
 *
 * A notification scheduled in the past is not an error on either platform — it
 * simply never fires, which looks identical to the feature being broken.
 */
export function nextReminderSlot(now: Date, hour: number): Date {
  const today = atHour(now, hour);
  if (today.getTime() > now.getTime()) return today;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return atHour(tomorrow, hour);
}

function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function planExpiryNotifications(
  items: readonly ExpiringItem[],
  options: { leadDays: number; hour: number; now: Date },
): PendingNotification[] {
  const { leadDays, hour, now } = options;

  // Bucket by expiry *date*, not by item: a shelf of yoghurts bought together
  // is one fact about the fridge, not three.
  const byDate = new Map<string, number>();
  for (const item of items) {
    const date = item.expiresAt?.trim();
    if (!date) continue;
    const days = daysUntilExpiry(date, now);
    if (days === null || days < 0) continue; // already gone off; the list shows it
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }

  const floor = nextReminderSlot(now, hour);

  // Several dates can clamp onto the same slot, so collect by moment.
  const bySlot = new Map<number, { count: number; daysUntil: number }>();
  for (const [date, count] of byDate) {
    const expiry = parseLocalDate(date);
    if (!expiry) continue;

    const ideal = atHour(
      new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate() - leadDays),
      hour,
    );
    const fireAt = ideal.getTime() > floor.getTime() ? ideal : floor;
    const daysUntil = Math.max(0, daysUntilExpiry(date, fireAt) ?? 0);

    const existing = bySlot.get(fireAt.getTime());
    bySlot.set(fireAt.getTime(), {
      count: (existing?.count ?? 0) + count,
      // Understating urgency is the harm, so the soonest date sets the wording.
      daysUntil: existing ? Math.min(existing.daysUntil, daysUntil) : daysUntil,
    });
  }

  return [...bySlot.entries()]
    .map(([time, group]) => ({
      key: `expiry:${time}`,
      kind: 'expiry' as const,
      fireAt: new Date(time),
      count: group.count,
      daysUntil: group.daysUntil,
    }))
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

export function planMealNotifications(
  meals: readonly PlannedMeal[],
  options: { hour: number; now: Date },
): PendingNotification[] {
  const { hour, now } = options;
  const today = todayISODate(now);

  return meals
    .filter((meal) => meal.date >= today)
    .map((meal) => {
      const date = parseLocalDate(meal.date);
      return date ? { meal, fireAt: atHour(date, hour) } : null;
    })
    .filter((row): row is { meal: PlannedMeal; fireAt: Date } => row !== null)
    // A reminder to cook dinner that lands after dinner is noise, so today's
    // meal survives only while its hour is still ahead.
    .filter((row) => row.fireAt.getTime() > now.getTime())
    .map((row) => ({
      key: `meal:${row.meal.date}`,
      kind: 'meal' as const,
      fireAt: row.fireAt,
      count: 1,
      daysUntil: 0,
      title: row.meal.title,
    }))
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/**
 * Food that is already past its date and still in the kitchen.
 *
 * The expiry warning deliberately stops at the expiry date, so without this
 * the app goes silent at exactly the moment something became waste. One
 * summary, not one per item — the point is "go and look in the fridge".
 */
export function planExpiredNotifications(
  items: readonly ExpiringItem[],
  options: { hour: number; now: Date },
): PendingNotification[] {
  const { hour, now } = options;

  let count = 0;
  for (const item of items) {
    const date = item.expiresAt?.trim();
    if (!date) continue;
    const days = daysUntilExpiry(date, now);
    if (days !== null && days < 0) count += 1;
  }
  if (count === 0) return [];

  const fireAt = nextReminderSlot(now, hour);
  return [{ key: `expired:${fireAt.getTime()}`, kind: 'expired', fireAt, count, daysUntil: 0 }];
}

/**
 * What is still waiting on the shopping list.
 *
 * A list written days ago is only useful if it resurfaces before the next trip
 * to the shop, and the app cannot know when that is — so it says it once, at
 * the same hour as everything else, and stops as soon as the list is cleared.
 */
export function planShoppingNotifications(
  items: readonly ShoppingLine[],
  options: { hour: number; now: Date },
): PendingNotification[] {
  const { hour, now } = options;
  const count = items.filter((line) => !line.purchased).length;
  if (count === 0) return [];

  const fireAt = nextReminderSlot(now, hour);
  return [{ key: `shopping:${fireAt.getTime()}`, kind: 'shopping', fireAt, count, daysUntil: 0 }];
}

/**
 * A nudge when tomorrow has nothing to cook.
 *
 * Judged from the moment the reminder *lands*, not from now: after the evening
 * hour has passed, the earliest it can arrive is tomorrow evening, and by then
 * "tomorrow" is a different day. Asking about the wrong one would nag someone
 * about a day they had already planned.
 */
export function planPlanningNotifications(
  meals: readonly PlannedMeal[],
  options: { hour: number; now: Date },
): PendingNotification[] {
  const { hour, now } = options;
  const fireAt = nextReminderSlot(now, hour);
  const nextDay = new Date(fireAt.getFullYear(), fireAt.getMonth(), fireAt.getDate() + 1);
  const target = todayISODate(nextDay);

  if (meals.some((meal) => meal.date === target)) return [];
  return [{ key: `planning:${fireAt.getTime()}`, kind: 'planning', fireAt, count: 0, daysUntil: 1 }];
}

export function planNotifications(options: {
  items: readonly ExpiringItem[];
  meals: readonly PlannedMeal[];
  shopping?: readonly ShoppingLine[];
  toggles: NotificationToggles;
  leadDays: number;
  hour: number;
  now: Date;
  max?: number;
}): PendingNotification[] {
  const { items, meals, shopping = [], toggles, leadDays, hour, now, max = MAX_SCHEDULED } = options;

  return [
    ...(toggles.expiry ? planExpiryNotifications(items, { leadDays, hour, now }) : []),
    ...(toggles.meals ? planMealNotifications(meals, { hour, now }) : []),
    ...(toggles.expired ? planExpiredNotifications(items, { hour, now }) : []),
    ...(toggles.shopping ? planShoppingNotifications(shopping, { hour, now }) : []),
    ...(toggles.planning ? planPlanningNotifications(meals, { hour, now }) : []),
  ]
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    // Soonest-first before the cut, so what gets dropped is the distant future.
    .slice(0, max);
}

/** Everything a scheduled reminder is built out of. See `schedulerSignature`. */
export interface SchedulerSignatureInput {
  readonly locale: string;
  readonly toggles: NotificationToggles;
  readonly leadDays: number;
  readonly hour: number;
  /**
   * The OS permission as last observed. Part of the signature because it is
   * granted from the settings screen long after the scheduler last ran: at
   * that moment nothing about the kitchen has changed, so without this the
   * plan is never rebuilt and the phone holds no reminders at all.
   */
  readonly permission: string;
  /**
   * Bumped when the app returns to the foreground. Reminders are scheduled
   * relative to "now", so an app carried across midnight — or reopened days
   * later — is holding a plan built for the wrong day, even though none of
   * the data moved.
   */
  readonly revision: number;
  readonly items: readonly { readonly expiresAt?: string | null }[];
  readonly meals: readonly PlannedMeal[];
  readonly unpurchasedCount: number;
}

/**
 * Collapses the scheduler's inputs into one comparable string.
 *
 * Rebuilding the plan means cancelling and re-arming every reminder, so it
 * must happen when — and only when — something that could make a pending
 * reminder wrong has moved. Object identity is useless for that: TanStack
 * Query hands back a fresh array on every refetch even when nothing changed.
 */
export function schedulerSignature(input: SchedulerSignatureInput): string {
  const { toggles } = input;
  return [
    input.locale,
    toggles.expiry,
    toggles.meals,
    toggles.expired,
    toggles.shopping,
    toggles.planning,
    input.leadDays,
    input.hour,
    input.permission,
    input.revision,
    input.items.map((item) => item.expiresAt ?? '-').join(','),
    input.meals.map((meal) => `${meal.date}:${meal.title}`).join(','),
    input.unpurchasedCount,
  ].join('|');
}
