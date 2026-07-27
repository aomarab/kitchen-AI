import type { PlanScope } from '@kitchen/contracts';

/** Number of days each plan scope spans. Monthly is four whole weeks. */
export const DAYS_BY_SCOPE: Record<PlanScope, number> = {
  daily: 1,
  weekly: 7,
  monthly: 28,
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** All dates in the plan window, ascending, as `YYYY-MM-DD`. */
export function planDates(startsOn: string, scope: PlanScope): string[] {
  const count = DAYS_BY_SCOPE[scope];
  return Array.from({ length: count }, (_, i) => addDays(startsOn, i));
}

/**
 * Recipes a single Stage-B call may be asked for.
 *
 * Measured against real gpt-5: one day of three meals costs ~8.7k output
 * tokens and ~70s. A whole week in one call is therefore ~60k tokens and well
 * over any workable timeout — and that is exactly what the original
 * week-sized grouping asked for. It did not merely run slow, it never
 * completed: the call timed out, the SDK retried it twice because a timeout
 * looks transient, and the job failed after ~6 minutes having been billed for
 * three abandoned generations. Weekly and monthly plans could not be produced
 * at all.
 *
 * Groups are therefore sized in recipes, not days. The planner core already
 * carries the depleted pantry and the used-title list from one group to the
 * next, so more groups changes cost and latency but not the plan.
 */
export const MAX_RECIPES_PER_GENERATION = 4;

/**
 * Extra attempts for a single generation group that fails at the transport
 * level. Splitting a plan into several calls means several chances to hit a
 * dropped connection, and without this one of them discards every group that
 * already succeeded — along with what they cost.
 */
export const PLAN_GROUP_TRANSIENT_RETRIES = 2;

/**
 * Splits the plan window into generation groups, each small enough to actually
 * come back. Whole days are kept together so a day is never split across two
 * calls; a scope always yields at least one group. See spec §5.4.
 */
export function planGroups(
  startsOn: string,
  scope: PlanScope,
  slotsPerDay: number,
): string[][] {
  const dates = planDates(startsOn, scope);
  const perDay = Math.max(1, slotsPerDay);
  const daysPerGroup = Math.max(1, Math.floor(MAX_RECIPES_PER_GENERATION / perDay));
  const groups: string[][] = [];
  for (let i = 0; i < dates.length; i += daysPerGroup) {
    groups.push(dates.slice(i, i + daysPerGroup));
  }
  return groups;
}

export function lastDate(startsOn: string, scope: PlanScope): string {
  return addDays(startsOn, DAYS_BY_SCOPE[scope] - 1);
}
