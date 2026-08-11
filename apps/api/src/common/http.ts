import {
  createParamDecorator,
  type ArgumentMetadata,
  type ExecutionContext,
  type PipeTransform,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { HOUSEHOLD_HEADER, IDEMPOTENCY_HEADER } from '@kitchen/contracts';
import { AppError } from './errors.js';

/**
 * Validates a request payload against a contract schema. Use with any schema
 * from `@kitchen/contracts` so the API can never accept something the clients
 * cannot produce.
 *
 *   @Body(new ZodPipe(loginRequestSchema)) body: LoginRequest
 */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw AppError.validation({
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }
}

/** Reads and requires the `x-household-id` header. */
export const HouseholdId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const value = request.headers[HOUSEHOLD_HEADER];
  const householdId = Array.isArray(value) ? value[0] : value;
  if (!householdId) throw new AppError('HOUSEHOLD_REQUIRED');
  return householdId;
});

/** Reads the optional `idempotency-key` header. */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const value = request.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(value) ? value[0] : value;
    return key ?? null;
  },
);

/**
 * Reads the `idempotency-key` header and throws VALIDATION_ERROR when it is
 * absent. Required on job-creating routes where a missing key makes retries
 * double-charge: the jobs table's NULL uniqueness means two keyless requests
 * for the same action always create two rows, so a network retry after the
 * spend commits debits a second time.
 */
export const RequiredIdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const value = request.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(value) ? value[0] : value;
    if (!key) {
      throw AppError.validation({
        issues: [{ path: IDEMPOTENCY_HEADER, message: 'idempotency-key header is required' }],
      });
    }
    return key;
  },
);
