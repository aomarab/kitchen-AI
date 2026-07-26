import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from './errors.js';
import type { HouseholdContext } from './request-context.js';

/**
 * Injects the household verified by {@link HouseholdGuard}. Only valid on routes
 * guarded by it.
 *
 *   listInventory(@CurrentHousehold() household: HouseholdContext) { ... }
 */
export const CurrentHousehold = createParamDecorator(
  (_data: unknown, context: ExecutionContext): HouseholdContext => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.household) throw new AppError('HOUSEHOLD_REQUIRED');
    return request.household;
  },
);
