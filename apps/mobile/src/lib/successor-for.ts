import type { HouseholdMember } from '@kitchen/contracts';

/**
 * The surviving member a household is handed over to, or `null` when the user
 * is its only member. Mirrors the server's `succeedHousehold` logic exactly:
 * rank survivors by earliest `joinedAt` (ties broken by lowest `userId`),
 * then prefer those with `role === 'owner'`; fall back to the earliest
 * survivor of any role only when no owner survives.
 */
export function successorFor(members: HouseholdMember[], currentUserId: string): HouseholdMember | null {
  const survivors = members.filter((member) => member.userId !== currentUserId);
  if (survivors.length === 0) return null;
  const ranked = [...survivors].sort(
    (a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() ||
      (a.userId < b.userId ? -1 : 1),
  );
  const owners = ranked.filter((m) => m.role === 'owner');
  return owners.length > 0 ? owners[0]! : ranked[0]!;
}
