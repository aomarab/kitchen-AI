import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import {
  applyTimerAction,
  MAX_TIMER_DURATION_SEC,
  projectTimer,
  type CookingTimer,
  type CreateTimerRequest,
  type UpdateTimerRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { cookingTimers } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { toIso } from '../common/serialization.js';

interface TimerRow {
  id: string;
  householdId: string;
  label: string;
  durationSec: number;
  status: 'running' | 'paused' | 'done';
  endsAt: Date | null;
  remainingSec: number;
  createdAt: Date;
}

/**
 * The contract's state machine refuses in its own vocabulary so every surface
 * can share it; the API is the only caller that turns a refusal into an error
 * envelope, so the mapping lives here.
 */
const REFUSALS: Record<'not_running' | 'not_paused' | 'too_long', () => AppError> = {
  not_running: () => AppError.conflict('errors.timerNotRunning'),
  not_paused: () => AppError.conflict('errors.timerNotPaused'),
  too_long: () =>
    AppError.conflict('errors.timerTooLong', { maxSec: MAX_TIMER_DURATION_SEC }),
};

function toTimer(row: TimerRow): CookingTimer {
  return {
    id: row.id,
    householdId: row.householdId,
    label: row.label,
    durationSec: row.durationSec,
    status: row.status,
    endsAt: row.endsAt === null ? null : toIso(row.endsAt),
    remainingSec: row.remainingSec,
    createdAt: toIso(row.createdAt),
  };
}

@Injectable()
export class TimersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(householdId: string, now: Date = new Date()): Promise<CookingTimer[]> {
    const rows = await this.db
      .select()
      .from(cookingTimers)
      .where(eq(cookingTimers.householdId, householdId))
      .orderBy(asc(cookingTimers.createdAt));
    return rows.map((row) => projectTimer(toTimer(row), now));
  }

  async create(
    householdId: string,
    body: CreateTimerRequest,
    now: Date = new Date(),
  ): Promise<CookingTimer> {
    const [row] = await this.db
      .insert(cookingTimers)
      .values({
        householdId,
        label: body.label,
        durationSec: body.durationSec,
        status: 'running',
        endsAt: new Date(now.getTime() + body.durationSec * 1000),
        remainingSec: body.durationSec,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toTimer(row!);
  }

  /**
   * Apply one state-machine action.
   *
   * Every transition is computed from the **projected** timer, not the stored
   * row: a running row whose deadline has passed is already finished, and
   * pausing or resuming it would resurrect a timer the kiosk has been showing
   * as done. Writing the result back is also how an expired row eventually
   * stops being `running` — nothing sweeps the table on a schedule in this
   * phase.
   */
  async update(
    householdId: string,
    id: string,
    body: UpdateTimerRequest,
    now: Date = new Date(),
  ): Promise<CookingTimer> {
    const current = projectTimer(await this.require(householdId, id), now);
    const result = applyTimerAction(current, body, now);
    if (!result.ok) throw REFUSALS[result.reason]();
    const next = result.timer;

    const [row] = await this.db
      .update(cookingTimers)
      .set({
        status: next.status,
        endsAt: next.endsAt === null ? null : new Date(next.endsAt),
        remainingSec: next.remainingSec,
        durationSec: next.durationSec,
        updatedAt: now,
      })
      .where(and(eq(cookingTimers.id, id), eq(cookingTimers.householdId, householdId)))
      .returning();
    return toTimer(row!);
  }

  async remove(householdId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(cookingTimers)
      .where(and(eq(cookingTimers.id, id), eq(cookingTimers.householdId, householdId)))
      .returning({ id: cookingTimers.id });
    if (deleted.length === 0) throw AppError.notFound('errors.NOT_FOUND');
  }

  private async require(householdId: string, id: string): Promise<CookingTimer> {
    const [row] = await this.db
      .select()
      .from(cookingTimers)
      .where(and(eq(cookingTimers.id, id), eq(cookingTimers.householdId, householdId)))
      .limit(1);
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    return toTimer(row);
  }
}
