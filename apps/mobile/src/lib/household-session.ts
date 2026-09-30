import type { MessageKey } from '@kitchen/i18n';
import { errorMessageKey } from './errors';

export interface HouseholdMembershipState {
  householdIds: readonly string[];
  activeHouseholdId: string | null;
}

export interface NextHouseholdMembershipState {
  householdIds: string[];
  activeHouseholdId: string | null;
}

export type HouseholdLeaveDestination = '/home' | '/onboarding';
export type HouseholdSaveAction = 'invalid' | 'noop' | 'save';

export interface HouseholdLeaveRouter {
  canDismiss?: () => boolean;
  dismissAll?: () => void;
  replace: (href: HouseholdLeaveDestination) => void;
}

export function householdSaveAction(draftName: string, currentName: string): HouseholdSaveAction {
  const trimmed = draftName.trim();
  if (trimmed.length === 0) return 'invalid';
  return trimmed === currentName ? 'noop' : 'save';
}

export function membershipAfterLeavingHousehold(
  state: HouseholdMembershipState,
  leavingHouseholdId: string,
): NextHouseholdMembershipState {
  const householdIds = state.householdIds.filter((id) => id !== leavingHouseholdId);
  const activeHouseholdId =
    state.activeHouseholdId === leavingHouseholdId ||
    (state.activeHouseholdId !== null && !householdIds.includes(state.activeHouseholdId))
      ? (householdIds[0] ?? null)
      : state.activeHouseholdId;

  return { householdIds, activeHouseholdId };
}

export function routeAfterHouseholdLeave(
  activeHouseholdId: string | null,
): HouseholdLeaveDestination {
  return activeHouseholdId ? '/home' : '/onboarding';
}

export function resetAfterHouseholdLeave(
  router: HouseholdLeaveRouter,
  activeHouseholdId: string | null,
): void {
  if (router.canDismiss?.()) router.dismissAll?.();
  router.replace(routeAfterHouseholdLeave(activeHouseholdId));
}

export function leaveHouseholdErrorKey(error: unknown): MessageKey {
  return errorMessageKey(error);
}
