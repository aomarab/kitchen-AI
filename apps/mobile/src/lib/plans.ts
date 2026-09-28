export interface PlanWeekEntry {
  readonly date: string;
  readonly state?: string;
}

export interface PlanWeek {
  readonly startsOn: string;
  readonly entries: readonly PlanWeekEntry[];
}

export interface PlanWeekDay {
  readonly date: string;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  readonly planned: boolean;
}

export interface PlanCoverageLike {
  readonly coverageRatio: number;
  readonly shortfalls: readonly unknown[];
}

export interface PlanProgressPlan {
  readonly entries: readonly {
    readonly state: string;
  }[];
}

export interface PlanProgress {
  readonly cooked: number;
  readonly total: number;
  readonly toBuy: number | null;
  readonly cookedTileSpan: 1 | 2;
  readonly coverageRatio: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

function isoFromUtcDay(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function planWeekDays(
  plan: PlanWeek,
  selectedDate: string,
  today: string,
): readonly PlanWeekDay[] {
  const start = utcDay(plan.startsOn);
  const selected = utcDay(selectedDate);
  const weekOffset = Math.max(0, Math.floor((selected - start) / (7 * MS_PER_DAY)));
  const weekStart = start + weekOffset * 7 * MS_PER_DAY;
  const plannedDates = new Set(plan.entries.map((entry) => entry.date));

  return Array.from({ length: 7 }, (_, index) => {
    const date = isoFromUtcDay(weekStart + index * MS_PER_DAY);
    return {
      date,
      isToday: date === today,
      isSelected: date === selectedDate,
      planned: plannedDates.has(date),
    };
  });
}

export function planProgress(
  plan: PlanProgressPlan,
  coverage?: PlanCoverageLike | null,
): PlanProgress {
  const toBuyCount = coverage?.shortfalls.length ?? 0;
  const toBuy = toBuyCount > 0 ? toBuyCount : null;

  return {
    cooked: plan.entries.filter((entry) => entry.state === 'cooked').length,
    total: plan.entries.length,
    toBuy,
    cookedTileSpan: toBuy === null ? 2 : 1,
    coverageRatio: coverage?.coverageRatio ?? null,
  };
}
