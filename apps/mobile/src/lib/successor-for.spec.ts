import { describe, it, expect } from 'vitest';
import type { HouseholdMember } from '@kitchen/contracts';
import { successorFor } from './successor-for';

const CURRENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeMember(userId: string, role: 'owner' | 'member', joinedAt: string): HouseholdMember {
  return { userId, displayName: 'X', email: 'x@x.com', role, joinedAt };
}

describe('successorFor', () => {
  it('owner precedence: earlier member loses to later owner', () => {
    const members = [
      makeMember(CURRENT_ID, 'owner', '2023-01-01T00:00:00Z'),
      makeMember('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member', '2023-02-01T00:00:00Z'),
      makeMember('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', '2023-03-01T00:00:00Z'),
    ];
    const result = successorFor(members, CURRENT_ID);
    expect(result?.userId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  });

  it('fallback preserved: all non-owners → earliest survivor wins', () => {
    const members = [
      makeMember(CURRENT_ID, 'owner', '2023-01-01T00:00:00Z'),
      makeMember('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'member', '2023-02-01T00:00:00Z'),
      makeMember('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'member', '2023-05-01T00:00:00Z'),
    ];
    const result = successorFor(members, CURRENT_ID);
    expect(result?.userId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  });

  it('tie-break preserved: two owners same joinedAt → lower userId wins', () => {
    const sameDate = '2023-06-01T00:00:00Z';
    const members = [
      makeMember(CURRENT_ID, 'owner', '2023-01-01T00:00:00Z'),
      makeMember('ffffffff-ffff-4fff-8fff-ffffffffffff', 'owner', sameDate),
      makeMember('11111111-1111-4111-8111-111111111111', 'owner', sameDate),
    ];
    const result = successorFor(members, CURRENT_ID);
    expect(result?.userId).toBe('11111111-1111-4111-8111-111111111111');
  });
});
