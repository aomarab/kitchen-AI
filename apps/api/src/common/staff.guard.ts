import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/index.js';
import { users } from '../db/schema.js';
import { AppError } from './errors.js';

/**
 * Guards every route declared `staff: true` in the route registry. Reads the
 * global `users.role` for the authenticated user; anything but `staff` is
 * `FORBIDDEN`. Must run after {@link AuthGuard}.
 *
 * The role is read from the database on every request rather than carried in
 * the access token: a revoked staff member keeps a valid token for the whole
 * `JWT_ACCESS_TTL`, and the console is exactly the surface where that window
 * matters.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authUser = request.authUser;
    if (!authUser) throw AppError.unauthenticated();

    const [row] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, authUser.userId))
      .limit(1);

    // A missing row is a deleted account with a live token — not staff.
    if (!row || row.role !== 'staff') throw AppError.forbidden();

    return true;
  }
}
