import { and, eq } from 'drizzle-orm';
import { households, householdMembers } from '../db/schema.js';
import type { Database } from '../db/index.js';

/** The transaction handle Drizzle hands to `db.transaction`. */
export type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Orders surviving members so succession is deterministic and therefore
 * testable: earliest `joinedAt` first, ties broken by the lowest `userId`.
 * Shared by every household teardown path so the two passes below cannot drift
 * into subtly different comparators.
 */
function bySeniority(
  a: { joinedAt: Date; userId: string },
  b: { joinedAt: Date; userId: string },
): number {
  return a.joinedAt.getTime() - b.joinedAt.getTime() || (a.userId < b.userId ? -1 : 1);
}

/**
 * Hands over or tears down a single household so it no longer depends on the
 * departing user. Locks the household's membership rows first: two co-owners
 * deleting concurrently would otherwise each see the other as a survivor, both
 * skip promotion, and leave the household with no owner at all.
 */
async function succeedHousehold(tx: DbTx, householdId: string, userId: string): Promise<void> {
  const locked = await tx
    .select({
      userId: householdMembers.userId,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .for('update');

  const survivors = locked.filter((row) => row.userId !== userId);

  if (survivors.length === 0) {
    // No one is left to inherit — cascade the household away through every
    // household-scoped table.
    await tx.delete(households).where(eq(households.id, householdId));
    return;
  }

  // min(joined_at), tie-broken by the lowest user id so the outcome is
  // deterministic and therefore testable.
  const ranked = [...survivors].sort(bySeniority);

  let owners = ranked.filter((row) => row.role === 'owner');
  if (owners.length === 0) {
    // `ranked` is non-empty here because `survivors` is, so the heir is safe.
    const heir = ranked[0]!;
    await tx
      .update(householdMembers)
      .set({ role: 'owner' })
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, heir.userId),
        ),
      );
    owners = [heir];
  }

  // The RESTRICT fires whenever created_by points at the departing user,
  // even when they were never an owner — a creator who handed the household
  // over still trips it. So this runs for every surviving household, not
  // only the promotion case. `owners` is non-empty by construction above.
  await tx
    .update(households)
    .set({ createdBy: owners[0]!.userId })
    .where(and(eq(households.id, householdId), eq(households.createdBy, userId)));
}

/**
 * Hands over or tears down every household the user still pins, so the user
 * row can then be deleted.
 *
 * `households.created_by` is ON DELETE RESTRICT, so this is not optional
 * housekeeping: without it, deleting the user throws a foreign-key error.
 * Must run inside the same transaction as the user delete — a crash between
 * the two would leave a household owned by a user who is halfway gone.
 *
 * Two passes are required because a household can pin the user through two
 * independent FKs. The first visits households the user is a *member* of. The
 * second visits households the user *created* but is no longer a member of:
 * `households.service.ts leave()` deletes a membership without rewriting
 * `created_by`, so a creator who left (while another owner remained) still
 * pins the RESTRICT FK that the membership pass never sees.
 */
export async function applyHouseholdSuccession(tx: DbTx, userId: string): Promise<void> {
  const memberships = await tx
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId));

  const visited = new Set<string>();
  for (const { householdId } of memberships) {
    await succeedHousehold(tx, householdId, userId);
    visited.add(householdId);
  }

  // Households the user created but no longer belongs to. The membership pass
  // never visits these, yet `created_by` still points at the departing user.
  const created = await tx
    .select({ id: households.id })
    .from(households)
    .where(eq(households.createdBy, userId));

  for (const { id } of created) {
    if (visited.has(id)) continue;
    await succeedHousehold(tx, id, userId);
  }
}
