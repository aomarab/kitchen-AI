import { describe, expect, it } from 'vitest';
import { REMINDER_MESSAGE_KEYS, type ReminderOccurrence } from '@kitchen/contracts';
import {
  hydrationFraction,
  minutesSinceFired,
  nudgeRows,
  outstandingCount,
} from './wellness';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-27T12:00:00.000Z');

function occurrence(
  id: string,
  minutesAgo: number,
  acknowledgedAt: string | null,
  type: ReminderOccurrence['type'] = 'break',
): ReminderOccurrence {
  return {
    id,
    householdId: HOUSEHOLD_ID,
    type,
    channel: 'screen',
    messageKey: REMINDER_MESSAGE_KEYS[type],
    firedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    acknowledgedAt,
  };
}

const settings = (hydrationGoalCups: number) =>
  ({
    householdId: HOUSEHOLD_ID,
    breakEnabled: true,
    stretchEnabled: true,
    morningEnabled: true,
    hydrationEnabled: true,
    breakCadenceMinutes: 60,
    stretchCadenceMinutes: 90,
    hydrationGoalCups,
    quietHoursStart: 22,
    quietHoursEnd: 7,
    timeZone: 'UTC',
  }) as const;

describe('nudgeRows', () => {
  it('puts every outstanding nudge before every answered one', () => {
    const rows = nudgeRows([
      occurrence('answered-recent', 5, 'done'),
      occurrence('pending-old', 90, null),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['pending-old', 'answered-recent']);
  });

  it('orders each half newest first', () => {
    const rows = nudgeRows([
      occurrence('p-old', 90, null),
      occurrence('a-old', 120, 'done'),
      occurrence('p-new', 10, null),
      occurrence('a-new', 30, 'done'),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['p-new', 'p-old', 'a-new', 'a-old']);
  });

  it('keeps answered nudges visible, so a fully answered day is not an empty screen', () => {
    expect(nudgeRows([occurrence('a', 30, 'done')])).toHaveLength(1);
  });

  it('is empty only when the engine fired nothing', () => {
    expect(nudgeRows([])).toEqual([]);
  });

  it('falls back to the type message key when the server sent an empty one', () => {
    const rows = nudgeRows([{ ...occurrence('a', 5, null, 'stretch'), messageKey: '' }]);
    expect(rows[0]?.messageKey).toBe(REMINDER_MESSAGE_KEYS.stretch);
  });
});

describe('outstandingCount', () => {
  it('counts only nudges still owed an answer', () => {
    expect(
      outstandingCount([
        occurrence('a', 5, null),
        occurrence('b', 10, 'done'),
        occurrence('c', 15, null),
      ]),
    ).toBe(2);
  });

  it('is zero for an empty ledger', () => {
    expect(outstandingCount([])).toBe(0);
  });
});

describe('hydrationFraction', () => {
  it('is the acknowledged cups over the goal', () => {
    const cups = [
      occurrence('a', 60, 'done', 'hydration'),
      occurrence('b', 30, 'done', 'hydration'),
    ];
    expect(hydrationFraction(cups, settings(8))).toBeCloseTo(0.25);
  });

  it('ignores cups nobody drank', () => {
    expect(hydrationFraction([occurrence('a', 30, null, 'hydration')], settings(8))).toBe(0);
  });

  it('clamps above the goal — a bar wider than its track is a bug, not a reward', () => {
    const cups = Array.from({ length: 5 }, (_, i) =>
      occurrence(`c${i}`, i, 'done', 'hydration'),
    );
    expect(hydrationFraction(cups, settings(2))).toBe(1);
  });

  it('returns 0 rather than dividing by a zero goal', () => {
    expect(hydrationFraction([occurrence('a', 5, 'done', 'hydration')], settings(0))).toBe(0);
  });
});

describe('minutesSinceFired', () => {
  it('reports whole minutes elapsed', () => {
    expect(minutesSinceFired(occurrence('a', 45, null).firedAt, NOW)).toBe(45);
  });

  it('floors a future timestamp to 0 instead of reporting negative minutes', () => {
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    expect(minutesSinceFired(future, NOW)).toBe(0);
  });
});
