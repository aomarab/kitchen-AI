import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import type { HouseholdRole } from '@kitchen/contracts';
import * as schema from '../db/schema.js';
import { loadEnv, type Env } from '../config/env.js';

export type TestDatabase = PostgresJsDatabase<typeof schema>;

export interface TestContext {
  env: Env;
  client: ReturnType<typeof postgres>;
  db: TestDatabase;
  jwt: JwtService;
}

/**
 * Integration specs run against the live seeded Postgres at DATABASE_URL. Each
 * spec opens its own pool in `beforeAll` and closes it in `afterAll`.
 */
export function createTestContext(): TestContext {
  const env = loadEnv();
  const client = postgres(env.DATABASE_URL, { max: 3 });
  const db = drizzle(client, { schema });
  const jwt = new JwtService({
    secret: env.JWT_SECRET,
    signOptions: { expiresIn: env.JWT_ACCESS_TTL },
  });
  return { env, client, db, jwt };
}

export async function seedUser(db: TestDatabase, email?: string): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({ email: email ?? `test+${randomUUID()}@example.com`, displayName: 'Test User' })
    .returning({ id: schema.users.id });
  if (!row) throw new Error('failed to seed user');
  return row.id;
}

export async function seedHousehold(
  db: TestDatabase,
  userId: string,
  role: HouseholdRole = 'owner',
): Promise<string> {
  const [row] = await db
    .insert(schema.households)
    .values({ name: 'Test Household', inviteCode: randomUUID().slice(0, 12), createdBy: userId })
    .returning({ id: schema.households.id });
  if (!row) throw new Error('failed to seed household');
  await db.insert(schema.householdMembers).values({ householdId: row.id, userId, role });
  return row.id;
}

/**
 * Delete households first (their `created_by` FK is ON DELETE RESTRICT), which
 * cascades members, locations, items and events, then delete the users, which
 * cascades refresh tokens, oauth accounts and profiles.
 */
export async function cleanup(
  db: TestDatabase,
  ids: { households?: string[]; users?: string[] },
): Promise<void> {
  if (ids.households?.length) {
    await db.delete(schema.households).where(inArray(schema.households.id, ids.households));
  }
  if (ids.users?.length) {
    await db.delete(schema.users).where(inArray(schema.users.id, ids.users));
  }
}
