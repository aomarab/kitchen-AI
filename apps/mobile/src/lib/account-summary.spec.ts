import { describe, expect, it } from 'vitest';
import type { Profile } from '@kitchen/contracts';
import { accountDietKey, activeHouseholdForAccount } from './account-summary';

const baseProfile = {
  halal: false,
  dietaryPrefs: [],
} as Pick<Profile, 'halal' | 'dietaryPrefs'>;

const households = [
  { id: 'home', name: 'Home Kitchen', members: [] },
  { id: 'studio', name: 'Studio Kitchen', members: [] },
] as const;

describe('accountDietKey', () => {
  it('uses the halal summary ahead of other diet preferences', () => {
    expect(accountDietKey({ ...baseProfile, halal: true, dietaryPrefs: ['vegan'] })).toBe(
      'profile.halal',
    );
  });

  it('uses the first dietary preference when halal is off', () => {
    expect(accountDietKey({ ...baseProfile, dietaryPrefs: ['high_protein', 'keto'] })).toBe(
      'mobile.diet.high_protein',
    );
  });

  it('falls back when the profile has no diet rules', () => {
    expect(accountDietKey(baseProfile)).toBe('mobile.account.noDietRules');
  });
});

describe('activeHouseholdForAccount', () => {
  it('returns the active household when it is present', () => {
    expect(activeHouseholdForAccount(households, 'studio')?.name).toBe('Studio Kitchen');
  });

  it('falls back to the first household when the active id is stale', () => {
    expect(activeHouseholdForAccount(households, 'missing')?.name).toBe('Home Kitchen');
  });

  it('returns null for a household-less account', () => {
    expect(activeHouseholdForAccount([], null)).toBeNull();
    expect(activeHouseholdForAccount(undefined, null)).toBeNull();
  });
});
