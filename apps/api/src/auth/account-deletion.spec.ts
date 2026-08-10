import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { applyHouseholdSuccession } from './account-deletion.js';
import { households, householdMembers, users } from '../db/schema.js';
import { cleanup, createTestContext, seedHousehold, seedUser, type TestContext } from '../testing/harness.js';

describe('applyHouseholdSuccession', () => {
  let ctx: TestContext;
  const userIds: string[] = [];
  const householdIds: string[] = [];

  async function addMember(
    householdId: string,
    userId: string,
    role: 'owner' | 'member',
    joinedAt: Date,
  ): Promise<void> {
    await ctx.db.insert(householdMembers).values({ householdId, userId, role, joinedAt });
  }

  async function track(fn: () => Promise<string>): Promise<string> {
    const id = await fn();
    userIds.push(id);
    return id;
  }

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterAll(async () => {
    await cleanup(ctx.db, { households: householdIds, users: userIds });
    await ctx.client.end();
  });

  it('deletes a household whose only member is leaving', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const rows = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(rows).toEqual([]);
  });

  it('promotes the longest-standing member when the only owner leaves', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const early = await track(() => seedUser(ctx.db));
    const late = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    await addMember(householdId, early, 'member', new Date('2026-01-01T00:00:00Z'));
    await addMember(householdId, late, 'member', new Date('2026-06-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const rows = await ctx.db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));

    expect(rows.find((row) => row.userId === early)?.role).toBe('owner');
    expect(rows.find((row) => row.userId === late)?.role).toBe('member');
  });

  it('breaks a joined_at tie by the lowest user id, so the result is deterministic', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const a = await track(() => seedUser(ctx.db));
    const b = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    const sameMoment = new Date('2026-03-03T00:00:00Z');
    await addMember(householdId, a, 'member', sameMoment);
    await addMember(householdId, b, 'member', sameMoment);

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const expected = [a, b].sort()[0];
    const rows = await ctx.db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));

    expect(rows.find((row) => row.userId === expected)?.role).toBe('owner');
  });

  it('leaves an existing co-owner in place instead of promoting anyone', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const coOwner = await track(() => seedUser(ctx.db));
    const member = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    await addMember(householdId, coOwner, 'owner', new Date('2026-05-01T00:00:00Z'));
    await addMember(householdId, member, 'member', new Date('2026-01-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const rows = await ctx.db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));

    expect(rows.find((row) => row.userId === member)?.role).toBe('member');
    expect(rows.find((row) => row.userId === coOwner)?.role).toBe('owner');
  });

  it('repoints created_by to the surviving owner', async () => {
    const owner = await track(() => seedUser(ctx.db));
    const survivor = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, owner);
    householdIds.push(householdId);
    await addMember(householdId, survivor, 'member', new Date('2026-01-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, owner);
    });

    const [row] = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(row?.createdBy).toBe(survivor);
  });

  it('repoints created_by when the creator was never an owner', async () => {
    const creator = await track(() => seedUser(ctx.db));
    const owner = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, creator);
    householdIds.push(householdId);
    // The creator handed the household over and stayed on as a plain member.
    await ctx.db
      .update(householdMembers)
      .set({ role: 'member' })
      .where(eq(householdMembers.userId, creator));
    await addMember(householdId, owner, 'owner', new Date('2026-02-02T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, creator);
      await tx.delete(users).where(eq(users.id, creator));
    });

    const [row] = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(row?.createdBy).toBe(owner);
  });

  it('handles a user in several households at once', async () => {
    const user = await track(() => seedUser(ctx.db));
    const survivor = await track(() => seedUser(ctx.db));
    const soloId = await seedHousehold(ctx.db, user);
    const sharedId = await seedHousehold(ctx.db, user);
    householdIds.push(sharedId);
    await addMember(sharedId, survivor, 'member', new Date('2026-01-01T00:00:00Z'));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, user);
    });

    const remaining = await ctx.db
      .select()
      .from(households)
      .where(inArray(households.id, [soloId, sharedId]));

    expect(remaining.map((row) => row.id)).toEqual([sharedId]);
    expect(remaining[0]?.createdBy).toBe(survivor);
  });

  it('repoints created_by for a household the creator left but still pins', async () => {
    const creator = await track(() => seedUser(ctx.db));
    const survivor = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, creator);
    householdIds.push(householdId);
    await addMember(householdId, survivor, 'owner', new Date('2026-04-04T00:00:00Z'));
    // The creator left: leave() removes their membership row but never
    // rewrites created_by, so the household still pins the RESTRICT FK to them
    // and the membership pass never visits it.
    await ctx.db
      .delete(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, creator)));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, creator);
      // Deleting the user inside the same transaction turns a missed repoint
      // into a real foreign-key violation rather than a soft assertion.
      await tx.delete(users).where(eq(users.id, creator));
    });

    const [row] = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(row?.createdBy).toBe(survivor);
  });

  it('tears down a household the creator abandoned with no members left', async () => {
    const creator = await track(() => seedUser(ctx.db));
    const householdId = await seedHousehold(ctx.db, creator);
    householdIds.push(householdId);
    // The creator left and no members remain, yet created_by still pins the
    // household to them via the RESTRICT FK.
    await ctx.db
      .delete(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, creator)));

    await ctx.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, creator);
    });

    const rows = await ctx.db.select().from(households).where(eq(households.id, householdId));
    expect(rows).toEqual([]);
  });

  it('does nothing for a user with no households', async () => {
    const loner = await track(() => seedUser(ctx.db));
    await expect(
      ctx.db.transaction(async (tx) => {
        await applyHouseholdSuccession(tx, loner);
      }),
    ).resolves.not.toThrow();
  });
});
