import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, gte } from 'drizzle-orm';
import {
  dueReminderTypes,
  reminderSettingsSchema,
  wakingStart,
  REMINDER_MESSAGE_KEYS,
  type FiredState,
  type ReminderOccurrence,
  type ReminderSettings,
  type ReminderType,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { reminderOccurrences, reminderSettings } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { toIso } from '../common/serialization.js';

interface OccurrenceRow {
  id: string;
  householdId: string;
  type: ReminderType;
  channel: 'screen';
  messageKey: string;
  firedAt: Date;
  acknowledgedAt: Date | null;
}

function toOccurrence(row: OccurrenceRow): ReminderOccurrence {
  return {
    id: row.id,
    householdId: row.householdId,
    type: row.type,
    channel: row.channel,
    messageKey: row.messageKey,
    firedAt: toIso(row.firedAt),
    acknowledgedAt: row.acknowledgedAt ? toIso(row.acknowledgedAt) : null,
  };
}

/**
 * The wellness firing engine (kitchen companion spec — Feature 2).
 *
 * All of the behaviour lives here rather than in the BullMQ processor, which is
 * a three-line adapter that calls `sweep(new Date())`. The scheduler is a
 * trigger, not logic, so every rule is testable against a real database with an
 * injected clock instead of only through a running worker.
 *
 * **Delivery is the ledger.** There is no push channel and no speech in this
 * phase (both are Feature 4), so a fired nudge is a row that clients poll for.
 * Nothing here pretends a nudge was spoken.
 */
@Injectable()
export class RemindersFiringService {
  private readonly logger = new Logger(RemindersFiringService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Fire every nudge that is due across every household that has **saved**
   * reminder settings.
   *
   * Households without a settings row are skipped on purpose. `get()` reports
   * defaults for them so the settings screen has something to show, but a
   * defaulted read is not consent to be nudged — the saved row is the only
   * opt-in signal that actually exists in the data.
   *
   * Returns the occurrences written, newest last.
   */
  async sweep(now: Date = new Date()): Promise<ReminderOccurrence[]> {
    const households = await this.db
      .select({ householdId: reminderSettings.householdId })
      .from(reminderSettings);

    const fired: ReminderOccurrence[] = [];
    for (const { householdId } of households) {
      try {
        fired.push(...(await this.sweepHousehold(householdId, now)));
      } catch (error) {
        // One household's bad data must not stop the others being nudged.
        this.logger.error(`reminder sweep failed for household ${householdId}`, error);
      }
    }
    return fired;
  }

  /**
   * Fire the due nudges for one household inside a transaction that holds the
   * settings row `FOR UPDATE`. That lock is required for correctness, not
   * speed: two overlapping sweeps would otherwise both read "nothing fired
   * yet" and write the same nudge twice.
   */
  async sweepHousehold(householdId: string, now: Date): Promise<ReminderOccurrence[]> {
    return this.db.transaction(async (tx) => {
      const [settingsRow] = await tx
        .select()
        .from(reminderSettings)
        .where(eq(reminderSettings.householdId, householdId))
        .for('update')
        .limit(1);
      if (!settingsRow) return [];

      const settings = toSettings(settingsRow);
      const since = wakingStart(settings, now);
      const today = await tx
        .select()
        .from(reminderOccurrences)
        .where(
          and(
            eq(reminderOccurrences.householdId, householdId),
            gte(reminderOccurrences.firedAt, since),
          ),
        )
        .orderBy(asc(reminderOccurrences.firedAt));

      const due = dueReminderTypes(settings, firedState(today as OccurrenceRow[]), now);
      if (due.length === 0) return [];

      const rows = await tx
        .insert(reminderOccurrences)
        .values(
          due.map((type) => ({
            householdId,
            type,
            channel: 'screen' as const,
            messageKey: REMINDER_MESSAGE_KEYS[type],
            firedAt: now,
          })),
        )
        .returning();
      return (rows as OccurrenceRow[]).map(toOccurrence);
    });
  }

  /**
   * The household's nudges for the current waking day, oldest first. `since`
   * overrides the window; without it the caller gets exactly the set the kiosk
   * needs to say "3 of 8 cups".
   */
  async list(
    householdId: string,
    since?: string,
    now: Date = new Date(),
  ): Promise<ReminderOccurrence[]> {
    const from = since ? new Date(since) : wakingStart(await this.settingsFor(householdId), now);
    const rows = await this.db
      .select()
      .from(reminderOccurrences)
      .where(
        and(
          eq(reminderOccurrences.householdId, householdId),
          gte(reminderOccurrences.firedAt, from),
        ),
      )
      .orderBy(asc(reminderOccurrences.firedAt));
    return (rows as OccurrenceRow[]).map(toOccurrence);
  }

  /**
   * Mark a nudge as acted on. Idempotent: acknowledging twice keeps the first
   * timestamp, because the second click did not produce a second cup of water.
   */
  async acknowledge(
    householdId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<ReminderOccurrence> {
    const [existing] = await this.db
      .select()
      .from(reminderOccurrences)
      .where(and(eq(reminderOccurrences.id, id), eq(reminderOccurrences.householdId, householdId)))
      .limit(1);
    if (!existing) throw AppError.notFound('errors.reminderNotFound');
    if (existing.acknowledgedAt) return toOccurrence(existing as OccurrenceRow);

    const [row] = await this.db
      .update(reminderOccurrences)
      .set({ acknowledgedAt: now })
      .where(eq(reminderOccurrences.id, id))
      .returning();
    return toOccurrence(row as OccurrenceRow);
  }

  private async settingsFor(householdId: string): Promise<ReminderSettings> {
    const [row] = await this.db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.householdId, householdId))
      .limit(1);
    // A household with no saved row still reads its own occurrences; the
    // defaults only decide which waking window `list` defaults to.
    if (!row) return reminderSettingsSchema.parse({ householdId });
    return toSettings(row);
  }
}

interface SettingsRow {
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

function toSettings(row: SettingsRow): ReminderSettings {
  return {
    householdId: row.householdId,
    breakEnabled: row.breakEnabled,
    stretchEnabled: row.stretchEnabled,
    morningEnabled: row.morningEnabled,
    hydrationEnabled: row.hydrationEnabled,
    breakCadenceMinutes: row.breakCadenceMinutes as ReminderSettings['breakCadenceMinutes'],
    hydrationGoalCups: row.hydrationGoalCups,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    timeZone: row.timeZone,
  };
}

/** Collapse today's ledger into what `dueReminderTypes` needs. */
function firedState(rows: OccurrenceRow[]): FiredState {
  const state: FiredState = { lastFiredAt: {}, countToday: {} };
  for (const row of rows) {
    state.countToday[row.type] = (state.countToday[row.type] ?? 0) + 1;
    const last = state.lastFiredAt[row.type];
    if (!last || row.firedAt > last) state.lastFiredAt[row.type] = row.firedAt;
  }
  return state;
}
