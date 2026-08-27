import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';
import { DEFAULT_ASSISTANT_PERSONA, assistantPersonaSchema } from './voice.js';

/* ------------------------------------------------------------------ */
/* Household                                                           */
/* ------------------------------------------------------------------ */

export const householdRoleSchema = z.enum(['owner', 'member']);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

export const householdMemberSchema = z.object({
  userId: uuidSchema,
  displayName: z.string(),
  email: z.string().email(),
  role: householdRoleSchema,
  joinedAt: isoDateTimeSchema,
});
export type HouseholdMember = z.infer<typeof householdMemberSchema>;

export const householdSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(80),
  inviteCode: z.string().length(6),
  createdBy: uuidSchema,
  createdAt: isoDateTimeSchema,
  members: z.array(householdMemberSchema),
});
export type Household = z.infer<typeof householdSchema>;

export const createHouseholdRequestSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateHouseholdRequest = z.infer<typeof createHouseholdRequestSchema>;

export const joinHouseholdRequestSchema = z.object({
  inviteCode: z.string().length(6),
});
export type JoinHouseholdRequest = z.infer<typeof joinHouseholdRequestSchema>;

export const updateHouseholdRequestSchema = z.object({
  name: z.string().min(1).max(80),
});
export type UpdateHouseholdRequest = z.infer<typeof updateHouseholdRequestSchema>;

/* ------------------------------------------------------------------ */
/* Profile — drives meal-plan personalization (spec §2)                */
/* ------------------------------------------------------------------ */

export const dietaryPreferenceSchema = z.enum([
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'low_carb',
  'gluten_free',
  'dairy_free',
  'low_sodium',
  'high_protein',
]);
export type DietaryPreference = z.infer<typeof dietaryPreferenceSchema>;

export const healthGoalSchema = z.enum([
  'weight_loss',
  'muscle_gain',
  'maintenance',
  'diabetic_friendly',
  'heart_healthy',
]);
export type HealthGoal = z.infer<typeof healthGoalSchema>;

export const cuisineSchema = z.enum([
  'levantine',
  'gulf',
  'egyptian',
  'moroccan',
  'turkish',
  'persian',
  'indian',
  'italian',
  'mediterranean',
  'chinese',
  'japanese',
  'thai',
  'mexican',
  'american',
  'french',
]);
export type Cuisine = z.infer<typeof cuisineSchema>;

export const profileSchema = z.object({
  userId: uuidSchema,
  dietaryPrefs: z.array(dietaryPreferenceSchema).default([]),
  /** Free text so users can list allergies we do not enumerate. */
  allergies: z.array(z.string().min(1).max(60)).default([]),
  halal: z.boolean().default(false),
  cuisinePrefs: z.array(cuisineSchema).default([]),
  householdSize: z.number().int().min(1).max(20).default(2),
  healthGoals: z.array(healthGoalSchema).default([]),
  /**
   * Which persona the live assistant speaks as. Per-user rather than
   * household-scoped: two people sharing a kitchen should not have to agree on
   * one voice. See the voice & personalization spec.
   */
  assistantPersona: assistantPersonaSchema.default(DEFAULT_ASSISTANT_PERSONA),
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileRequestSchema = profileSchema.omit({ userId: true }).partial();
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
