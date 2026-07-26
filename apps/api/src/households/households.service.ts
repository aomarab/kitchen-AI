import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import type {
  CreateHouseholdRequest,
  Household,
  HouseholdRole,
  UpdateHouseholdRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { households, householdMembers, users } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { generateInviteCode } from './invite-code.js';
import { toHousehold, type MemberRow } from './households.serializer.js';

const MAX_CODE_ATTEMPTS = 8;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class HouseholdsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Household[]> {
    const ids = await this.db
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    return Promise.all(ids.map((row) => this.load(row.householdId)));
  }

  async create(userId: string, dto: CreateHouseholdRequest): Promise<Household> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        const household = await this.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(households)
            .values({ name: dto.name, inviteCode: generateInviteCode(), createdBy: userId })
            .returning();
          if (!row) throw new AppError('INTERNAL_ERROR');
          await tx
            .insert(householdMembers)
            .values({ householdId: row.id, userId, role: 'owner' });
          return row.id;
        });
        return this.load(household);
      } catch (error) {
        if (isUniqueViolation(error) && attempt < MAX_CODE_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new AppError('INTERNAL_ERROR');
  }

  async join(userId: string, inviteCode: string): Promise<Household> {
    const [household] = await this.db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.inviteCode, inviteCode))
      .limit(1);
    if (!household) throw AppError.notFound('household.invalidCode');

    const [existing] = await this.db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, household.id),
          eq(householdMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      await this.db
        .insert(householdMembers)
        .values({ householdId: household.id, userId, role: 'member' })
        .onConflictDoNothing();
    }

    return this.load(household.id);
  }

  async update(userId: string, id: string, dto: UpdateHouseholdRequest): Promise<Household> {
    await this.requireMembership(userId, id);
    await this.db.update(households).set({ name: dto.name }).where(eq(households.id, id));
    return this.load(id);
  }

  async rotateInviteCode(userId: string, id: string): Promise<Household> {
    await this.requireMembership(userId, id);
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        await this.db
          .update(households)
          .set({ inviteCode: generateInviteCode() })
          .where(eq(households.id, id));
        return this.load(id);
      } catch (error) {
        if (isUniqueViolation(error) && attempt < MAX_CODE_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new AppError('INTERNAL_ERROR');
  }

  async leave(userId: string, id: string): Promise<void> {
    const role = await this.requireMembership(userId, id);

    if (role === 'owner') {
      const [owners] = await this.db
        .select({ value: count() })
        .from(householdMembers)
        .where(
          and(eq(householdMembers.householdId, id), eq(householdMembers.role, 'owner')),
        );
      if ((owners?.value ?? 0) <= 1) {
        // The last owner cannot abandon a household. See spec §3.4.
        throw AppError.conflict();
      }
    }

    await this.db
      .delete(householdMembers)
      .where(
        and(eq(householdMembers.householdId, id), eq(householdMembers.userId, userId)),
      );
  }

  private async requireMembership(userId: string, householdId: string): Promise<HouseholdRole> {
    const [membership] = await this.db
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) throw AppError.notFound();
    return membership.role;
  }

  private async load(id: string): Promise<Household> {
    const [household] = await this.db
      .select()
      .from(households)
      .where(eq(households.id, id))
      .limit(1);
    if (!household) throw AppError.notFound();

    const members: MemberRow[] = await this.db
      .select({
        userId: householdMembers.userId,
        displayName: users.displayName,
        email: users.email,
        role: householdMembers.role,
        joinedAt: householdMembers.joinedAt,
      })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, id));

    return toHousehold(household, members);
  }
}
