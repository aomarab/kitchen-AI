import type { User } from '@kitchen/contracts';
import { toIso } from '../common/serialization.js';

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  locale: 'en' | 'ar';
  passwordHash: string | null;
  createdAt: Date;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    locale: row.locale,
    hasPassword: row.passwordHash !== null,
    createdAt: toIso(row.createdAt),
  };
}
