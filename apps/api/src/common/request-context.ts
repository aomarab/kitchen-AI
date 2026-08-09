import type { HouseholdRole } from '@kitchen/contracts';

/** Set on the request by {@link AuthGuard} after a valid access token. */
export interface AuthUser {
  userId: string;
}

/** Set on the request by {@link HouseholdGuard} after membership is verified. */
export interface HouseholdContext {
  id: string;
  role: HouseholdRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      household?: HouseholdContext;
    }
  }
}
