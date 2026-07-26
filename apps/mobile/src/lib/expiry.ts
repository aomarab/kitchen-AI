/**
 * Expiry logic. Pure and calendar-day based so it is deterministic and testable
 * without a native runtime. Times are collapsed to local calendar days: an item
 * that expires "today" is urgent regardless of the hour.
 */

export type ExpiryStatus = 'none' | 'expired' | 'today' | 'soon' | 'ok';

/** Items within this many days (inclusive) are considered "expiring soon". */
export const EXPIRING_SOON_DAYS = 3;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Whole calendar days from `now` until `expiresAt` (YYYY-MM-DD). Negative when
 * already expired, `0` when it expires today, `null` when there is no date.
 */
export function daysUntilExpiry(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const parsed = new Date(`${expiresAt}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(parsed) - startOfDay(now)) / msPerDay);
}

export function expiryStatus(expiresAt: string | null, now: Date = new Date()): ExpiryStatus {
  const days = daysUntilExpiry(expiresAt, now);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= EXPIRING_SOON_DAYS) return 'soon';
  return 'ok';
}

export function isExpiringSoon(expiresAt: string | null, now: Date = new Date()): boolean {
  const status = expiryStatus(expiresAt, now);
  return status === 'expired' || status === 'today' || status === 'soon';
}

/** Local calendar date as `YYYY-MM-DD` (not UTC), for comparing plan entries. */
export function todayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Sort comparator putting the most urgent (soonest / already expired) items
 * first. Items without an expiry date sort last.
 */
export function byExpiryUrgency(
  a: { expiresAt: string | null },
  b: { expiresAt: string | null },
  now: Date = new Date(),
): number {
  const da = daysUntilExpiry(a.expiresAt, now);
  const db = daysUntilExpiry(b.expiresAt, now);
  if (da === null && db === null) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  return da - db;
}

/**
 * Whether a user-typed expiry date is something the API will accept.
 *
 * The field is free text, and `isoDateSchema` on the server only accepts
 * `YYYY-MM-DD`. Anything else came back as a 422 that neither screen rendered,
 * so "31/12/2026" simply did nothing when the user pressed save. Checked here
 * so the message lands next to the field instead.
 *
 * An empty value is valid — it means "no expiry date".
 */
export function isValidExpiryInput(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  // Rejects real-looking-but-impossible dates like 2026-02-31, which the regex
  // alone would pass and the server would reject.
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === trimmed;
}
