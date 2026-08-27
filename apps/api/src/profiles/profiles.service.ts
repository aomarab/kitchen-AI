import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  profileSchema,
  resolveAssistantPersona,
  type Cuisine,
  type DietaryPreference,
  type HealthGoal,
  type Profile,
  type UpdateProfileRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { profiles } from '../db/schema.js';

interface ProfileRow {
  userId: string;
  dietaryPrefs: string[];
  allergies: string[];
  halal: boolean;
  cuisinePrefs: string[];
  householdSize: number;
  healthGoals: string[];
  assistantPersona: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    userId: row.userId,
    dietaryPrefs: row.dietaryPrefs as DietaryPreference[],
    allergies: row.allergies,
    halal: row.halal,
    cuisinePrefs: row.cuisinePrefs as Cuisine[],
    householdSize: row.householdSize,
    healthGoals: row.healthGoals as HealthGoal[],
    // Resolved rather than cast: a stored id that has left the catalog must
    // degrade to the default, not surface as a value the client's schema
    // rejects. See the voice & personalization spec §5.
    assistantPersona: resolveAssistantPersona(row.assistantPersona),
  };
}

@Injectable()
export class ProfilesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(userId: string): Promise<Profile> {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (!row) return profileSchema.parse({ userId });
    return toProfile(row);
  }

  async update(userId: string, dto: UpdateProfileRequest): Promise<Profile> {
    const [row] = await this.db
      .insert(profiles)
      .values({ userId, ...dto, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { ...dto, updatedAt: new Date() },
      })
      .returning();
    if (!row) return this.get(userId);
    return toProfile(row);
  }
}
