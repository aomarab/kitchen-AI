import { describe, it, expect } from 'vitest';
import {
  planExpiryNotifications,
  planMealNotifications,
  planNotifications,
  nextReminderSlot,
  DEFAULT_LEAD_DAYS,
  DEFAULT_REMINDER_HOUR,
  MAX_SCHEDULED,
} from './notifications';

const HOUR = DEFAULT_REMINDER_HOUR;

/** Local time, because every calculation here is calendar-local by design. */
function at(iso: string): Date {
  return new Date(iso);
}

function item(expiresAt: string | null) {
  return { expiresAt };
}

describe('nextReminderSlot', () => {
  it('uses today when the hour is still ahead', () => {
    const slot = nextReminderSlot(at('2026-08-12T10:00:00'), HOUR);
    expect(slot.getDate()).toBe(12);
    expect(slot.getHours()).toBe(HOUR);
  });

  it('rolls to tomorrow once the hour has passed', () => {
    // Scheduling into the past silently drops the notification, so the guard
    // matters more than it looks.
    const slot = nextReminderSlot(at('2026-08-12T21:00:00'), HOUR);
    expect(slot.getDate()).toBe(13);
    expect(slot.getHours()).toBe(HOUR);
  });
});

describe('planExpiryNotifications', () => {
  const now = at('2026-08-12T10:00:00');

  it('sends one notification per expiry day, not one per item', () => {
    // Three yoghurts bought together expire together. Three buzzes for one
    // fridge shelf is how people turn notifications off.
    const rows = [item('2026-08-20'), item('2026-08-20'), item('2026-08-20')];
    const planned = planExpiryNotifications(rows, { leadDays: 2, hour: HOUR, now });

    expect(planned).toHaveLength(1);
    expect(planned[0]!.count).toBe(3);
  });

  it('fires the lead time before the food goes off, at the reminder hour', () => {
    const planned = planExpiryNotifications([item('2026-08-20')], {
      leadDays: 2,
      hour: HOUR,
      now,
    });

    expect(planned[0]!.fireAt.getDate()).toBe(18);
    expect(planned[0]!.fireAt.getHours()).toBe(HOUR);
    expect(planned[0]!.daysUntil).toBe(2);
  });

  it('still warns about food already inside the lead window', () => {
    // Milk bought today that expires tomorrow would want a notification
    // yesterday. Dropping it is the silent failure: the food most likely to be
    // wasted is exactly the food nearest its date.
    const planned = planExpiryNotifications([item('2026-08-13')], {
      leadDays: 5,
      hour: HOUR,
      now,
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]!.fireAt.getTime()).toBeGreaterThan(now.getTime());
    expect(planned[0]!.fireAt.getDate()).toBe(12);
    expect(planned[0]!.daysUntil).toBe(1);
  });

  it('merges days that collapse onto the same moment instead of stacking buzzes', () => {
    // Both are inside the lead window, so both clamp to tonight. Two
    // notifications arriving in the same second is a bug the user feels.
    const planned = planExpiryNotifications([item('2026-08-13'), item('2026-08-14')], {
      leadDays: 7,
      hour: HOUR,
      now,
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]!.count).toBe(2);
    // The soonest date wins the wording — understating urgency is the harm.
    expect(planned[0]!.daysUntil).toBe(1);
  });

  it('says nothing about food that has already gone off', () => {
    const planned = planExpiryNotifications([item('2026-08-01')], {
      leadDays: 2,
      hour: HOUR,
      now,
    });
    expect(planned).toHaveLength(0);
  });

  it('ignores items with no date at all', () => {
    const planned = planExpiryNotifications([item(null), item('')], {
      leadDays: 2,
      hour: HOUR,
      now,
    });
    expect(planned).toHaveLength(0);
  });

  it('returns them in the order they will arrive', () => {
    const planned = planExpiryNotifications(
      [item('2026-09-01'), item('2026-08-20'), item('2026-08-25')],
      { leadDays: 2, hour: HOUR, now },
    );

    const times = planned.map((row) => row.fireAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('planMealNotifications', () => {
  const now = at('2026-08-12T10:00:00');

  it('reminds about each upcoming meal on its own day', () => {
    const planned = planMealNotifications(
      [
        { date: '2026-08-13', title: 'Maqluba' },
        { date: '2026-08-14', title: 'Mansaf' },
      ],
      { hour: HOUR, now },
    );

    expect(planned.map((row) => row.title)).toEqual(['Maqluba', 'Mansaf']);
    expect(planned[0]!.fireAt.getDate()).toBe(13);
    expect(planned[0]!.fireAt.getHours()).toBe(HOUR);
  });

  it("keeps today's meal while the hour is still ahead", () => {
    const planned = planMealNotifications([{ date: '2026-08-12', title: 'Koshari' }], {
      hour: HOUR,
      now,
    });
    expect(planned).toHaveLength(1);
  });

  it("drops today's meal once its hour has gone", () => {
    // A reminder to cook dinner, delivered after dinner, is noise.
    const planned = planMealNotifications([{ date: '2026-08-12', title: 'Koshari' }], {
      hour: HOUR,
      now: at('2026-08-12T22:00:00'),
    });
    expect(planned).toHaveLength(0);
  });

  it('drops meals from days that have already been eaten', () => {
    const planned = planMealNotifications([{ date: '2026-08-01', title: 'Old' }], {
      hour: HOUR,
      now,
    });
    expect(planned).toHaveLength(0);
  });
});

describe('planNotifications', () => {
  const now = at('2026-08-12T10:00:00');

  it('never schedules more than the platform will hold', () => {
    // iOS keeps only the first 64 pending local notifications and silently
    // discards the rest, so an unbounded plan loses the ones that matter.
    const rows = Array.from({ length: 90 }, (_, index) => {
      const day = String((index % 28) + 1).padStart(2, '0');
      return item(`2027-01-${day}`);
    });

    const planned = planNotifications({
      items: rows,
      meals: [],
      leadDays: 2,
      hour: HOUR,
      now,
    });

    expect(planned.length).toBeLessThanOrEqual(MAX_SCHEDULED);
  });

  it('keeps the soonest when it has to drop some', () => {
    const rows = Array.from({ length: 90 }, (_, index) => {
      const date = new Date(2026, 7, 20 + index);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`;
      return item(iso);
    });

    const planned = planNotifications({
      items: rows,
      meals: [],
      leadDays: 2,
      hour: HOUR,
      now,
    });

    // Tomorrow's food matters more than food two months out.
    expect(planned[0]!.fireAt.getMonth()).toBe(7);
  });

  it('carries both kinds', () => {
    const planned = planNotifications({
      items: [item('2026-08-20')],
      meals: [{ date: '2026-08-13', title: 'Maqluba' }],
      leadDays: 2,
      hour: HOUR,
      now,
    });

    expect(planned.map((row) => row.kind).sort()).toEqual(['expiry', 'meal']);
  });

  it('gives every notification a distinct key', () => {
    const planned = planNotifications({
      items: [item('2026-08-20'), item('2026-08-25')],
      meals: [
        { date: '2026-08-20', title: 'A' },
        { date: '2026-08-25', title: 'B' },
      ],
      leadDays: 2,
      hour: HOUR,
      now,
    });

    const keys = planned.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('defaults', () => {
  it('warns before the food is already a problem', () => {
    expect(DEFAULT_LEAD_DAYS).toBeGreaterThanOrEqual(1);
  });

  it('lands in the evening, when there is still time to cook', () => {
    expect(DEFAULT_REMINDER_HOUR).toBeGreaterThanOrEqual(17);
    expect(DEFAULT_REMINDER_HOUR).toBeLessThanOrEqual(21);
  });
});
