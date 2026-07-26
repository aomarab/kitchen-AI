import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppError } from './errors.js';
import type { AuthUser } from './request-context.js';

interface AccessTokenClaims {
  sub: string;
}

/**
 * Requires a valid `Authorization: Bearer <access token>`. On success the
 * decoded user is attached to the request for {@link CurrentUser} and any guard
 * that runs after it (e.g. {@link HouseholdGuard}).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
    if (!token) throw AppError.unauthenticated();

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
      const authUser: AuthUser = { userId: claims.sub };
      request.authUser = authUser;
      return true;
    } catch {
      throw AppError.unauthenticated();
    }
  }
}
