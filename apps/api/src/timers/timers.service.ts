import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import {
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

/** The columns that make up a timer's state, as they are written back. */
interface TimerState {
  status: 'running' | 'paused' | 'done';
  endsAt: Date | null;
  remainingSec: number;
  durationSec: number;
}

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
    const next = this.transition(current, body, now);

    const [row] = await this.db
      .update(cookingTimers)
      .set({ ...next, updatedAt: now })
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

  private transition(timer: CookingTimer, body: UpdateTimerRequest, now: Date): TimerState {
    switch (body.action) {
      case 'pause': {
        if (timer.status !== 'running') throw AppError.conflict('errors.timerNotRunning');
        return {
          status: 'paused',
          endsAt: null,
          remainingSec: timer.remainingSec,
          durationSec: timer.durationSec,
        };
      }
      case 'resume': {
        if (timer.status !== 'paused') throw AppError.conflict('errors.timerNotPaused');
        return {
          status: 'running',
          endsAt: new Date(now.getTime() + timer.remainingSec * 1000),
          remainingSec: timer.remainingSec,
          durationSec: timer.durationSec,
        };
      }
      case 'stop': {
        // Stopping an already-finished timer is a no-op rather than a conflict:
        // it is the same button on the same card the user is looking at.
        return {
          status: 'done',
          endsAt: null,
          remainingSec: 0,
          durationSec: timer.durationSec,
        };
      }
      case 'extend': {
        const durationSec = timer.durationSec + body.seconds;
        if (durationSec > MAX_TIMER_DURATION_SEC) {
          throw AppError.conflict('errors.timerTooLong', { maxSec: MAX_TIMER_DURATION_SEC });
        }
        // "+1 min" on a card that is already ringing means give it another
        // minute, so extending a finished timer restarts it rather than failing.
        const remainingSec =
          timer.status === 'done' ? body.seconds : timer.remainingSec + body.seconds;
        if (timer.status === 'paused') {
          return { status: 'paused', endsAt: null, remainingSec, durationSec };
        }
        return {
          status: 'running',
          endsAt: new Date(now.getTime() + remainingSec * 1000),
          remainingSec,
          durationSec,
        };
      }
    }
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
