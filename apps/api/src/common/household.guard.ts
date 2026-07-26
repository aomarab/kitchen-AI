import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { HOUSEHOLD_HEADER, uuidSchema } from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { householdMembers } from '../db/schema.js';
import { AppError } from './errors.js';
import type { HouseholdContext } from './request-context.js';

/**
 * Guards every route with `household: true` in the route registry. Reads the
 * `x-household-id` header, confirms the authenticated user is a member, and
 * exposes the verified household via {@link CurrentHousehold}. A missing header
 * is `HOUSEHOLD_REQUIRED`; a non-member is `FORBIDDEN` so cross-household access
 * can never leak. Must run after {@link AuthGuard}.
 */
@Injectable()
export class HouseholdGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authUser = request.authUser;
    if (!authUser) throw AppError.unauthenticated();

    const raw = request.headers[HOUSEHOLD_HEADER];
    const householdId = Array.isArray(raw) ? raw[0] : raw;
    if (!householdId) throw new AppError('HOUSEHOLD_REQUIRED');
    if (!uuidSchema.safeParse(householdId).success) throw new AppError('HOUSEHOLD_REQUIRED');

    const [membership] = await this.db
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, authUser.userId),
        ),
      )
      .limit(1);

    if (!membership) throw AppError.forbidden();

    const household: HouseholdContext = { id: householdId, role: membership.role };
    request.household = household;
    return true;
  }
}
