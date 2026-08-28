import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { DEFAULT_ASSISTANT_PERSONA } from '@kitchen/contracts';
import { ProfilesService } from './profiles.service.js';
import { profiles } from '../db/schema.js';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import type { Database } from '../db/index.js';

/**
 * Integration test against the live database, because the behaviour worth
 * pinning here only exists at the storage boundary.
 *
 * `assistant_persona` is a `text` column, not a Postgres enum: the catalog
 * lives in `@kitchen/contracts` so it can be shared with the client, and
 * mirroring it as a database enum would mean a migration every time a persona
 * is added. The cost of that choice is that the column *can* hold a value the
 * catalog no longer offers — which is exactly what these tests cover.
 */
describe('ProfilesService assistant persona', () => {
  let ctx: TestContext;
  let service: ProfilesService;
  const userIds: string[] = [];

  beforeAll(() => {
    ctx = createTestContext();
    service = new ProfilesService(ctx.db as unknown as Database);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: userIds });
    await ctx.client.end();
  });

  async function newUser(): Promise<string> {
    const id = await seedUser(ctx.db);
    userIds.push(id);
    return id;
  }

  it('gives a user with no profile row the default persona', async () => {
    const userId = await newUser();
    const profile = await service.get(userId);
    expect(profile.assistantPersona).toBe(DEFAULT_ASSISTANT_PERSONA);
  });

  it('persists the assistant persona', async () => {
    const userId = await newUser();
    const updated = await service.update(userId, { assistantPersona: 'salma' });
    expect(updated.assistantPersona).toBe('salma');
    // Re-read rather than trusting the write's return value: the round trip is
    // the claim, and `update` returns the inserted row without re-selecting.
    expect((await service.get(userId)).assistantPersona).toBe('salma');
  });

  it('leaves other preferences alone when only the persona changes', async () => {
    const userId = await newUser();
    await service.update(userId, { halal: true, householdSize: 5 });
    await service.update(userId, { assistantPersona: 'omar' });
    const profile = await service.get(userId);
    expect(profile.assistantPersona).toBe('omar');
    expect(profile.halal).toBe(true);
    expect(profile.householdSize).toBe(5);
  });

  it('falls back to the default when the stored persona has left the catalog', async () => {
    const userId = await newUser();
    await service.update(userId, { assistantPersona: 'salma' });
    // Written past the service on purpose: this is the only way the column can
    // hold a stale id, and it is what happens to a real user when we retire a
    // persona they had chosen.
    await ctx.db
      .update(profiles)
      .set({ assistantPersona: sql`'a-persona-we-retired'` })
      .where(eq(profiles.userId, userId));

    const profile = await service.get(userId);

    // Not a throw: this value is read on the paid assistant path, after the
    // household has been charged. Refusing the session over a cosmetic
    // preference the user did not even set this time would be far worse than
    // giving them the default voice.
    expect(profile.assistantPersona).toBe(DEFAULT_ASSISTANT_PERSONA);
  });
});
