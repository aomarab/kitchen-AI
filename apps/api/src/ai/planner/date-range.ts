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
 * Splits the plan window into generation groups. Monthly is generated
 * week-by-week (four groups) so each week can be forward-simulated against what
 * earlier weeks consumed; daily and weekly are a single group. See spec §5.4.
 */
export function planWeeks(startsOn: string, scope: PlanScope): string[][] {
  const dates = planDates(startsOn, scope);
  if (scope !== 'monthly') return [dates];
  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) {
    weeks.push(dates.slice(i, i + 7));
  }
  return weeks;
}

export function lastDate(startsOn: string, scope: PlanScope): string {
  return addDays(startsOn, DAYS_BY_SCOPE[scope] - 1);
}
