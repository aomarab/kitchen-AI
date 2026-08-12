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

export type NotificationKind = 'expiry' | 'meal';

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

export function planNotifications(options: {
  items: readonly ExpiringItem[];
  meals: readonly PlannedMeal[];
  leadDays: number;
  hour: number;
  now: Date;
  max?: number;
}): PendingNotification[] {
  const { items, meals, leadDays, hour, now, max = MAX_SCHEDULED } = options;

  return [
    ...planExpiryNotifications(items, { leadDays, hour, now }),
    ...planMealNotifications(meals, { hour, now }),
  ]
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    // Soonest-first before the cut, so what gets dropped is the distant future.
    .slice(0, max);
}
