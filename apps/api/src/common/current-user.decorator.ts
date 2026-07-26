import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from './errors.js';
import type { AuthUser } from './request-context.js';

/**
 * Injects the authenticated user set by {@link AuthGuard}.
 *
 *   getMe(@CurrentUser() user: AuthUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.authUser) throw AppError.unauthenticated();
    return request.authUser;
  },
);
