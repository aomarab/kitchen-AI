import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  reminderOccurrenceListSchema,
  reminderOccurrenceSchema,
  pendingNudges,
} from '@kitchen/contracts';
import { createTestServer } from './server.node';

const BASE = 'http://localhost:3333';
const server = createTestServer(BASE);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

async function listOccurrences() {
  const response = await fetch(`${BASE}/reminders/occurrences`);
  expect(response.status).toBe(200);
  return reminderOccurrenceListSchema.parse(await response.json());
}

/**
 * The api-client validates every response against the contract schema, so a
 * fixture that merely *looks* right — a readable id like `occ-hydration` where
 * the schema demands a uuid — fails at runtime in the app while every unit test
 * still passes. These tests run the real handlers and parse what comes back.
 */
describe('reminder occurrence mocks', () => {
  it('serves a ledger that satisfies the contract schema', async () => {
    const occurrences = await listOccurrences();
    expect(occurrences.length).toBeGreaterThan(0);
  });

  it('seeds both answered and outstanding nudges, so the screen has both states', async () => {
    const occurrences = await listOccurrences();
    expect(pendingNudges(occurrences).length).toBeGreaterThan(0);
    expect(occurrences.some((o) => o.acknowledgedAt !== null)).toBe(true);
  });

  it('acknowledging stamps the occurrence and keeps the first timestamp', async () => {
    const target = pendingNudges(await listOccurrences())[0]!;

    const first = reminderOccurrenceSchema.parse(
      await (
        await fetch(`${BASE}/reminders/occurrences/${target.id}/acknowledge`, { method: 'POST' })
      ).json(),
    );
    expect(first.acknowledgedAt).not.toBeNull();

    const second = reminderOccurrenceSchema.parse(
      await (
        await fetch(`${BASE}/reminders/occurrences/${target.id}/acknowledge`, { method: 'POST' })
      ).json(),
    );
    expect(second.acknowledgedAt).toBe(first.acknowledgedAt);
  });

  it('404s an occurrence that does not exist instead of inventing one', async () => {
    const response = await fetch(
      `${BASE}/reminders/occurrences/00000000-0000-4000-8000-000000000999/acknowledge`,
      { method: 'POST' },
    );
    expect(response.status).toBe(404);
  });

  /**
   * The ledger is read from `wakingStart`, so a fixture placed "four hours ago"
   * is *before* waking whenever the app is opened in the morning and silently
   * vanishes. This pins the clock five minutes after waking — the worst case —
   * and asserts the whole seeded history is still there.
   */
  it('keeps the whole seeded ledger visible when opened just after waking', async () => {
    const justAfterWaking = new Date('2026-08-27T07:05:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(justAfterWaking);
    vi.resetModules();

    const { createTestServer: build } = await import('./server.node');
    const fresh = build(BASE);
    fresh.listen({ onUnhandledRequest: 'error' });
    try {
      const response = await fetch(`${BASE}/reminders/occurrences`);
      const occurrences = reminderOccurrenceListSchema.parse(await response.json());
      expect(occurrences).toHaveLength(4);
      expect(occurrences.some((o) => o.acknowledgedAt !== null)).toBe(true);
    } finally {
      fresh.close();
      vi.useRealTimers();
    }
  });
});
