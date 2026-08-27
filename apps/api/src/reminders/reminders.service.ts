import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  reminderSettingsSchema,
  type BreakCadenceMinutes,
  type ReminderSettings,
  type UpdateReminderSettingsRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { reminderSettings } from '../db/schema.js';

interface ReminderSettingsRow {
  householdId: string;
  breakEnabled: boolean;
  stretchEnabled: boolean;
  morningEnabled: boolean;
  hydrationEnabled: boolean;
  breakCadenceMinutes: number;
  hydrationGoalCups: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  timeZone: string;
}

function toReminderSettings(row: ReminderSettingsRow): ReminderSettings {
  return {
    householdId: row.householdId,
    breakEnabled: row.breakEnabled,
    stretchEnabled: row.stretchEnabled,
    morningEnabled: row.morningEnabled,
    hydrationEnabled: row.hydrationEnabled,
    breakCadenceMinutes: row.breakCadenceMinutes as BreakCadenceMinutes,
    hydrationGoalCups: row.hydrationGoalCups,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    timeZone: row.timeZone,
  };
}

@Injectable()
export class RemindersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(householdId: string): Promise<ReminderSettings> {
    const [row] = await this.db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.householdId, householdId))
      .limit(1);
    if (!row) return reminderSettingsSchema.parse({ householdId });
    return toReminderSettings(row);
  }

  async update(householdId: string, dto: UpdateReminderSettingsRequest): Promise<ReminderSettings> {
    const [row] = await this.db
      .insert(reminderSettings)
      .values({ householdId, ...dto, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: reminderSettings.householdId,
        set: { ...dto, updatedAt: new Date() },
      })
      .returning();
    if (!row) return this.get(householdId);
    return toReminderSettings(row);
  }
}
