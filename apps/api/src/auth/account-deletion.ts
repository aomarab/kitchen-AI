import { and, eq } from 'drizzle-orm';
import { households, householdMembers } from '../db/schema.js';
import type { Database } from '../db/index.js';

/** The transaction handle Drizzle hands to `db.transaction`. */
export type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Hands over or tears down every household the user belongs to, so the user
 * row can then be deleted.
 *
 * `households.created_by` is ON DELETE RESTRICT, so this is not optional
 * housekeeping: without it, deleting the user throws a foreign-key error.
 * Must run inside the same transaction as the user delete — a crash between
 * the two would leave a household owned by a user who is halfway gone.
 */
export async function applyHouseholdSuccession(tx: DbTx, userId: string): Promise<void> {
  const memberships = await tx
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId));

  for (const { householdId } of memberships) {
    // Lock every membership row for this household. Two co-owners deleting
    // concurrently would otherwise each see the other as a survivor, both skip
    // promotion, and leave the household with no owner at all.
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
      // Cascades through every household-scoped table.
      await tx.delete(households).where(eq(households.id, householdId));
      continue;
    }

    // min(joined_at), tie-broken by the lowest user id so the outcome is
    // deterministic and therefore testable.
    const bySeniority = [...survivors].sort(
      (a, b) =>
        a.joinedAt.getTime() - b.joinedAt.getTime() || (a.userId < b.userId ? -1 : 1),
    );

    let owners = bySeniority.filter((row) => row.role === 'owner');
    if (owners.length === 0) {
      const heir = bySeniority[0]!;
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
    // only the promotion case.
    await tx
      .update(households)
      .set({ createdBy: owners[0]!.userId })
      .where(and(eq(households.id, householdId), eq(households.createdBy, userId)));
  }
}
