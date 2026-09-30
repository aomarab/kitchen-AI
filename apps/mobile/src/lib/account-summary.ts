import type { DietaryPreference, Profile } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

export type AccountDietKey =
  'profile.halal' | 'mobile.account.noDietRules' | `mobile.diet.${DietaryPreference}`;

export interface AccountHouseholdSummarySource {
  id: string;
  name: string;
  members: readonly unknown[];
}

export function accountDietKey(profile: Pick<Profile, 'halal' | 'dietaryPrefs'>): AccountDietKey {
  if (profile.halal) return 'profile.halal';
  const firstDiet = profile.dietaryPrefs[0];
  return firstDiet ? (`mobile.diet.${firstDiet}` as const) : 'mobile.account.noDietRules';
}

export function activeHouseholdForAccount(
  households: readonly AccountHouseholdSummarySource[] | null | undefined,
  activeHouseholdId: string | null,
): AccountHouseholdSummarySource | null {
  if (!households?.length) return null;
  return households.find((household) => household.id === activeHouseholdId) ?? households[0]!;
}

export function messageKeyForDiet(key: AccountDietKey): MessageKey {
  return key as MessageKey;
}
