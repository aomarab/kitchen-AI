import type { Household, HouseholdMember, HouseholdRole } from '@kitchen/contracts';
import { toIso } from '../common/serialization.js';

export interface HouseholdRow {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  createdAt: Date;
}

export interface MemberRow {
  userId: string;
  displayName: string;
  email: string;
  role: HouseholdRole;
  joinedAt: Date;
}

function toMember(row: MemberRow): HouseholdMember {
  return {
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    role: row.role,
    joinedAt: toIso(row.joinedAt),
  };
}

export function toHousehold(household: HouseholdRow, members: MemberRow[]): Household {
  return {
    id: household.id,
    name: household.name,
    inviteCode: household.inviteCode,
    createdBy: household.createdBy,
    createdAt: toIso(household.createdAt),
    members: members.map(toMember),
  };
}
