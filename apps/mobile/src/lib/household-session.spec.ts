import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '@kitchen/api-client';
import {
  leaveHouseholdErrorKey,
  membershipAfterLeavingHousehold,
  routeAfterHouseholdLeave,
} from './household-session';

describe('membershipAfterLeavingHousehold', () => {
  it('switches to the next household when the active one is left', () => {
    expect(
      membershipAfterLeavingHousehold(
        { householdIds: ['home', 'studio'], activeHouseholdId: 'home' },
        'home',
      ),
    ).toEqual({ householdIds: ['studio'], activeHouseholdId: 'studio' });
  });

  it('clears the active household when the last one is left', () => {
    expect(
      membershipAfterLeavingHousehold(
        { householdIds: ['home'], activeHouseholdId: 'home' },
        'home',
      ),
    ).toEqual({ householdIds: [], activeHouseholdId: null });
  });

  it('preserves the current active household when a different one is left', () => {
    expect(
      membershipAfterLeavingHousehold(
        { householdIds: ['home', 'studio'], activeHouseholdId: 'studio' },
        'home',
      ),
    ).toEqual({ householdIds: ['studio'], activeHouseholdId: 'studio' });
  });

  it('repairs a stale active household id after a leave mutation succeeds', () => {
    expect(
      membershipAfterLeavingHousehold(
        { householdIds: ['home', 'studio'], activeHouseholdId: 'missing' },
        'home',
      ),
    ).toEqual({ householdIds: ['studio'], activeHouseholdId: 'studio' });
  });
});

describe('routeAfterHouseholdLeave', () => {
  it('sends a user with another household back home', () => {
    expect(routeAfterHouseholdLeave('studio')).toBe('/home');
  });

  it('sends a household-less user to the existing onboarding gate', () => {
    expect(routeAfterHouseholdLeave(null)).toBe('/onboarding');
  });
});

describe('leaveHouseholdErrorKey', () => {
  it('uses the server message key for a last-owner conflict', () => {
    expect(
      leaveHouseholdErrorKey(
        new ApiError(409, { code: 'CONFLICT', messageKey: 'errors.CONFLICT' }),
      ),
    ).toBe('errors.CONFLICT');
  });

  it('maps transport failures through the existing translated error path', () => {
    expect(leaveHouseholdErrorKey(new NetworkError('offline'))).toBe('errors.offline');
  });
});
