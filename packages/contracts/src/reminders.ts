import { z } from 'zod';
import { uuidSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Wellness reminders — settings (design spec §92–98)                  */
/* ------------------------------------------------------------------ */

/** The four nudge types the wellness engine can fire. Spec §96. */
export const reminderTypeSchema = z.enum(['break', 'stretch', 'morning', 'hydration']);
export type ReminderType = z.infer<typeof reminderTypeSchema>;

/** Break cadence is one of four fixed intervals, in minutes. Spec §96. */
export const breakCadenceMinutesSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(90),
  z.literal(120),
]);
export type BreakCadenceMinutes = z.infer<typeof breakCadenceMinutesSchema>;

export const reminderSettingsSchema = z.object({
  householdId: uuidSchema,
  breakEnabled: z.boolean().default(true),
  stretchEnabled: z.boolean().default(true),
  morningEnabled: z.boolean().default(true),
  hydrationEnabled: z.boolean().default(true),
  breakCadenceMinutes: breakCadenceMinutesSchema.default(60),
  /** Cups of water per day. */
  hydrationGoalCups: z.number().int().min(1).max(20).default(8),
  /** Quiet-hours window as whole hours 0–23; nudges are suppressed inside it. */
  quietHoursStart: z.number().int().min(0).max(23).default(22),
  quietHoursEnd: z.number().int().min(0).max(23).default(7),
});
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export const updateReminderSettingsRequestSchema = reminderSettingsSchema
  .omit({ householdId: true })
  .partial();
export type UpdateReminderSettingsRequest = z.infer<typeof updateReminderSettingsRequestSchema>;
