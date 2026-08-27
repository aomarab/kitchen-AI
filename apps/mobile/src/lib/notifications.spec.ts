import { describe, it, expect } from 'vitest';
import {
  planExpiredNotifications,
  planExpiryNotifications,
  planMealNotifications,
  planNotifications,
  planPlanningNotifications,
  planShoppingNotifications,
  schedulerSignature,
  type NotificationToggles,
  type SchedulerSignatureInput,
  nextReminderSlot,
  DEFAULT_LEAD_DAYS,
  DEFAULT_REMINDER_HOUR,
  MAX_SCHEDULED,
  planTimerNotifications,
  type RunningTimer,
} from './notifications';

const HOUR = DEFAULT_REMINDER_HOUR;

const ALL_ON: NotificationToggles = {
  expiry: true,
  meals: true,
  expired: true,
  shopping: true,
  planning: true,
  timers: true,
};

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
      toggles: ALL_ON,
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
      toggles: ALL_ON,
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
      toggles: ALL_ON,
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
      toggles: ALL_ON,
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

describe('planExpiredNotifications', () => {
  const now = at('2026-08-12T10:00:00');

  it('counts only the food that has already gone off', () => {
    const planned = planExpiredNotifications(
      [item('2026-08-10'), item('2026-08-11'), item('2026-08-20'), item(null)],
      { hour: HOUR, now },
    );

    expect(planned).toHaveLength(1);
    expect(planned[0]!.kind).toBe('expired');
    expect(planned[0]!.count).toBe(2);
  });

  it('says nothing when nothing has gone off', () => {
    // Silence is the correct output. A "0 items expired" buzz is the fastest
    // way to teach someone to swipe these away without reading them.
    expect(planExpiredNotifications([item('2026-08-20')], { hour: HOUR, now })).toEqual([]);
  });

  it('treats today as still good', () => {
    // Food is edible on its date; it is only waste the day after.
    expect(planExpiredNotifications([item('2026-08-12')], { hour: HOUR, now })).toEqual([]);
  });

  it('arrives at the next reminder slot', () => {
    const planned = planExpiredNotifications([item('2026-08-01')], { hour: HOUR, now });
    expect(planned[0]!.fireAt.getTime()).toBe(nextReminderSlot(now, HOUR).getTime());
  });
});

describe('planShoppingNotifications', () => {
  const now = at('2026-08-12T10:00:00');

  it('counts what is still unbought', () => {
    const planned = planShoppingNotifications(
      [{ purchased: false }, { purchased: false }, { purchased: true }],
      { hour: HOUR, now },
    );

    expect(planned).toHaveLength(1);
    expect(planned[0]!.kind).toBe('shopping');
    expect(planned[0]!.count).toBe(2);
  });

  it('stays quiet once the whole list is bought', () => {
    expect(planShoppingNotifications([{ purchased: true }], { hour: HOUR, now })).toEqual([]);
  });

  it('stays quiet with no list at all', () => {
    expect(planShoppingNotifications([], { hour: HOUR, now })).toEqual([]);
  });
});

describe('planPlanningNotifications', () => {
  it('nudges when tomorrow has no meal planned', () => {
    const now = at('2026-08-12T10:00:00');
    const planned = planPlanningNotifications([], { hour: HOUR, now });

    expect(planned).toHaveLength(1);
    expect(planned[0]!.kind).toBe('planning');
  });

  it('stays quiet when tomorrow is already planned', () => {
    const now = at('2026-08-12T10:00:00');
    const planned = planPlanningNotifications([{ date: '2026-08-13', title: 'Maqluba' }], {
      hour: HOUR,
      now,
    });

    expect(planned).toEqual([]);
  });

  it('asks about the day after the reminder actually lands', () => {
    // 8pm, so the nudge cannot arrive until 7pm tomorrow — by which point
    // "tomorrow" means the 14th. Judging it against the 13th would send
    // someone a reminder to plan a day they had already planned.
    const now = at('2026-08-12T20:00:00');
    const planned = planPlanningNotifications([{ date: '2026-08-13', title: 'Maqluba' }], {
      hour: HOUR,
      now,
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]!.fireAt.getDate()).toBe(13);
  });
});

describe('planNotifications toggles', () => {
  const now = at('2026-08-12T10:00:00');
  const all = {
    items: [item('2026-08-10'), item('2026-08-20')],
    // Deliberately not tomorrow: a meal planned for tomorrow silences the
    // planning nudge, which is its own test below.
    meals: [{ date: '2026-08-20', title: 'Maqluba' }],
    shopping: [{ purchased: false }],
    timers: [{ id: 't1', label: 'Rice', endsAt: '2026-08-12T10:20:00', status: 'running' }],
    leadDays: 2,
    hour: HOUR,
    now,
  };

  const kinds = (toggles: NotificationToggles) =>
    [...new Set(planNotifications({ ...all, toggles }).map((row) => row.kind))].sort();

  it('carries every kind when everything is on', () => {
    expect(
      kinds({
        expiry: true,
        meals: true,
        expired: true,
        shopping: true,
        planning: true,
        timers: true,
      }),
    ).toEqual(['expired', 'expiry', 'meal', 'planning', 'shopping', 'timer']);
  });

  it('drops exactly the kind that is switched off', () => {
    // Each toggle is checked on its own: sharing the inventory list between
    // the expiry and expired reminders makes it easy to silence both at once.
    expect(
      kinds({ ...ALL_ON, expiry: false }),
    ).not.toContain('expiry');
    expect(
      kinds({ ...ALL_ON, meals: false }),
    ).not.toContain('meal');
    expect(
      kinds({ ...ALL_ON, expired: false }),
    ).not.toContain('expired');
    expect(
      kinds({ ...ALL_ON, shopping: false }),
    ).not.toContain('shopping');
    expect(
      kinds({ ...ALL_ON, planning: false }),
    ).not.toContain('planning');
    expect(kinds({ ...ALL_ON, timers: false })).not.toContain('timer');
  });

  it('schedules nothing at all when everything is off', () => {
    expect(
      planNotifications({
        ...all,
        toggles: {
          expiry: false,
          meals: false,
          expired: false,
          shopping: false,
          planning: false,
          timers: false,
        },
      }),
    ).toEqual([]);
  });
});

describe('schedulerSignature', () => {
  const base: SchedulerSignatureInput = {
    locale: 'en',
    toggles: {
      expiry: true,
      meals: true,
      expired: true,
      shopping: false,
      planning: false,
      timers: true,
    },
    leadDays: 2,
    hour: 19,
    permission: 'denied',
    revision: 0,
    items: [{ expiresAt: '2026-08-20' }],
    meals: [{ date: '2026-08-13', title: 'Shakshuka' }],
    unpurchasedCount: 3,
    timers: [{ id: 't1', label: 'Rice', endsAt: '2026-08-12T10:20:00.000Z', status: 'running' }],
  };

  it('is stable when nothing has moved', () => {
    expect(schedulerSignature(base)).toBe(schedulerSignature({ ...base }));
  });

  // The bug this exists for: permission is granted from the settings screen
  // long after the scheduler last ran. Nothing about the kitchen changed, so
  // unless permission is part of the signature the plan is never rebuilt and
  // the phone holds zero reminders forever.
  it('changes when permission changes', () => {
    expect(schedulerSignature({ ...base, permission: 'granted' })).not.toBe(
      schedulerSignature(base),
    );
  });

  // Reminders are scheduled relative to "now", so an app carried across
  // midnight is holding a plan built for the wrong day. Coming back to the
  // foreground has to force a rebuild even though no data changed.
  it('changes when the foreground revision changes', () => {
    expect(schedulerSignature({ ...base, revision: 1 })).not.toBe(schedulerSignature(base));
  });

  it('changes when an expiry date moves', () => {
    expect(schedulerSignature({ ...base, items: [{ expiresAt: '2026-08-21' }] })).not.toBe(
      schedulerSignature(base),
    );
  });

  it('changes when a toggle flips', () => {
    expect(
      schedulerSignature({ ...base, toggles: { ...base.toggles, shopping: true } }),
    ).not.toBe(schedulerSignature(base));
  });

  it('changes when the locale changes, because the text is baked in at schedule time', () => {
    expect(schedulerSignature({ ...base, locale: 'ar' })).not.toBe(schedulerSignature(base));
  });

  it('changes when a planned meal is retitled', () => {
    expect(
      schedulerSignature({ ...base, meals: [{ date: '2026-08-13', title: 'Mujaddara' }] }),
    ).not.toBe(schedulerSignature(base));
  });

  it('changes when the number of unbought items changes', () => {
    expect(schedulerSignature({ ...base, unpurchasedCount: 2 })).not.toBe(
      schedulerSignature(base),
    );
  });
});

describe('planTimerNotifications', () => {
  const now = at('2026-08-12T10:00:00');
  const timer = (over: Partial<RunningTimer> = {}): RunningTimer => ({
    id: 't1',
    label: 'Rice',
    endsAt: '2026-08-12T10:20:00',
    status: 'running',
    ...over,
  });

  it('fires at the instant the timer ends, not at the reminder hour', () => {
    const [row] = planTimerNotifications([timer()], { now });
    expect(row?.kind).toBe('timer');
    expect(row?.fireAt).toEqual(at('2026-08-12T10:20:00'));
    expect(row?.title).toBe('Rice');
  });

  it('ignores a paused timer', () => {
    // A paused timer carries a remaining duration and no end instant, so
    // there is nothing to schedule until it resumes.
    expect(planTimerNotifications([timer({ status: 'paused', endsAt: null })], { now })).toEqual([]);
  });

  it('ignores a paused timer even if it is still carrying an end instant', () => {
    // Belt and braces: the status is checked before the null is, so a server
    // that keeps `endsAt` across a pause cannot ring over a cold pot.
    expect(planTimerNotifications([timer({ status: 'paused' })], { now })).toEqual([]);
  });

  it('ignores a finished timer', () => {
    expect(planTimerNotifications([timer({ status: 'done' })], { now })).toEqual([]);
  });

  it('ignores a running timer with no end instant', () => {
    expect(planTimerNotifications([timer({ endsAt: null })], { now })).toEqual([]);
  });

  it('skips a running timer whose end has already passed', () => {
    // Neither OS delivers a trigger dated in the past, so this would not ring
    // — it would only consume one of the 64 slots iOS is willing to hold.
    expect(planTimerNotifications([timer({ endsAt: '2026-08-12T09:59:00' })], { now })).toEqual([]);
  });

  it('survives an unparseable end instant instead of scheduling an Invalid Date', () => {
    expect(planTimerNotifications([timer({ endsAt: 'not-a-date' })], { now })).toEqual([]);
  });

  it('keys by timer id so a rebuild replaces rather than duplicates', () => {
    const keys = planTimerNotifications([timer(), timer({ id: 't2', endsAt: '2026-08-12T10:30:00' })], {
      now,
    }).map((row) => row.key);
    expect(keys).toEqual(['timer:t1', 'timer:t2']);
  });
});

describe('planNotifications with timers', () => {
  const now = at('2026-08-12T10:00:00');

  /**
   * Enough expiry buckets to overflow the plan on their own.
   *
   * The dates must be *distinct*: expiry notifications are bucketed by date,
   * so ninety items sharing twenty-eight days produce twenty-eight rows and
   * the cap never bites — which would make the assertion below pass for the
   * wrong reason.
   */
  const crowd = Array.from({ length: 90 }, (_, index) => {
    const day = new Date(2027, 0, 1 + index);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate(),
    ).padStart(2, '0')}`;
    return item(iso);
  });

  it('the crowded fixture really does overflow the cap on its own', () => {
    // Guards the test below from passing because nothing was ever dropped.
    expect(
      planNotifications({
        items: crowd,
        meals: [],
        leadDays: 2,
        hour: HOUR,
        now,
        toggles: { ...ALL_ON, timers: false },
      }),
    ).toHaveLength(MAX_SCHEDULED);
  });

  it('keeps a timer in a plan that is already at the platform cap', () => {
    // Not a reservation: `MAX_TIMER_DURATION_SEC` caps a timer at twelve
    // hours and the rest of the plan is anchored to a daily evening slot, so
    // a timer is always among the soonest. This pins that reasoning down.
    const planned = planNotifications({
      items: crowd,
      meals: [],
      timers: [{ id: 'rice', label: 'Rice', endsAt: '2026-08-12T22:00:00', status: 'running' }],
      leadDays: 2,
      hour: HOUR,
      now,
      toggles: ALL_ON,
    });

    expect(planned).toHaveLength(MAX_SCHEDULED);
    expect(planned.some((row) => row.key === 'timer:rice')).toBe(true);
  });

  it('hands the scheduler a chronological list', () => {
    const planned = planNotifications({
      items: crowd,
      meals: [],
      timers: [{ id: 'rice', label: 'Rice', endsAt: '2026-08-12T22:00:00', status: 'running' }],
      leadDays: 2,
      hour: HOUR,
      now,
      toggles: ALL_ON,
    });
    const times = planned.map((row) => row.fireAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('schedulerSignature timers', () => {
  const base: SchedulerSignatureInput = {
    locale: 'en',
    toggles: ALL_ON,
    leadDays: 2,
    hour: 19,
    permission: 'granted',
    revision: 0,
    items: [],
    meals: [],
    unpurchasedCount: 0,
    timers: [],
  };

  const running: RunningTimer = {
    id: 't1',
    label: 'Rice',
    endsAt: '2026-08-12T10:20:00',
    status: 'running',
  };

  it('changes when a timer is started', () => {
    // Without this the effect never re-runs, and the alert is never armed at
    // all — starting a timer moves nothing else the scheduler watches.
    expect(schedulerSignature({ ...base, timers: [running] })).not.toBe(schedulerSignature(base));
  });

  it('changes when a timer is paused, even though its end instant does not move', () => {
    expect(schedulerSignature({ ...base, timers: [{ ...running, status: 'paused' }] })).not.toBe(
      schedulerSignature({ ...base, timers: [running] }),
    );
  });

  it('changes when a timer is extended', () => {
    expect(
      schedulerSignature({ ...base, timers: [{ ...running, endsAt: '2026-08-12T10:25:00' }] }),
    ).not.toBe(schedulerSignature({ ...base, timers: [running] }));
  });

  it('changes when the timers toggle is switched off', () => {
    expect(
      schedulerSignature({ ...base, toggles: { ...ALL_ON, timers: false } }),
    ).not.toBe(schedulerSignature(base));
  });
});
