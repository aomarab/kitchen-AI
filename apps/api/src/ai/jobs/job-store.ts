import { and, eq, isNull } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { Job, JobType } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { jobs } from '../../db/schema.js';

export interface JobRow {
  id: string;
  householdId: string;
  type: JobType;
  status: 'queued' | 'running' | 'done' | 'failed';
  idempotencyKey: string | null;
  progress: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: { code: string; messageKey: string } | null;
  attempts: number;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface CreateJobInput {
  householdId: string;
  type: JobType;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
}

export interface ResultRef {
  kind: 'meal_plan' | 'recognition_session' | 'recipe';
  id: string;
}

/**
 * Persistence for long-running jobs. The `(householdId, type, idempotencyKey)`
 * unique index makes creation idempotent: a double-tapped request with the same
 * key returns the existing job instead of creating a second one (spec §3.3).
 */
export interface JobStore {
  create(input: CreateJobInput): Promise<{ job: JobRow; created: boolean }>;
  get(householdId: string, id: string): Promise<JobRow | null>;
  load(id: string): Promise<JobRow | null>;
  markRunning(id: string): Promise<void>;
  setProgress(id: string, progress: number): Promise<void>;
  markDone(id: string, result: ResultRef): Promise<void>;
  markFailed(id: string, error: { code: string; messageKey: string }): Promise<void>;
}

export function toJob(row: JobRow): Job {
  const result = row.result as (ResultRef & Record<string, unknown>) | null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: Number(row.progress),
    resultRef: result && result.kind && result.id ? { kind: result.kind, id: result.id } : null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

@Injectable()
export class DrizzleJobStore implements JobStore {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: CreateJobInput): Promise<{ job: JobRow; created: boolean }> {
    const inserted = (await this.db
      .insert(jobs)
      .values({
        householdId: input.householdId,
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        status: 'queued',
      })
      .onConflictDoNothing({
        target: [jobs.householdId, jobs.type, jobs.idempotencyKey],
      })
      .returning()) as JobRow[];

    if (inserted[0]) return { job: inserted[0], created: true };

    // Conflict on the idempotency key — return the job that already exists.
    const existing = (await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.householdId, input.householdId),
          eq(jobs.type, input.type),
          input.idempotencyKey
            ? eq(jobs.idempotencyKey, input.idempotencyKey)
            : isNull(jobs.idempotencyKey),
        ),
      )
      .limit(1)) as JobRow[];
    return { job: existing[0]!, created: false };
  }

  async get(householdId: string, id: string): Promise<JobRow | null> {
    const rows = (await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.householdId, householdId)))
      .limit(1)) as JobRow[];
    return rows[0] ?? null;
  }

  async load(id: string): Promise<JobRow | null> {
    const rows = (await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)) as JobRow[];
    return rows[0] ?? null;
  }

  async markRunning(id: string): Promise<void> {
    await this.db.update(jobs).set({ status: 'running' }).where(eq(jobs.id, id));
  }

  async setProgress(id: string, progress: number): Promise<void> {
    await this.db.update(jobs).set({ progress: progress.toFixed(3) }).where(eq(jobs.id, id));
  }

  async markDone(id: string, result: ResultRef): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: 'done', progress: '1', result: { ...result }, finishedAt: new Date() })
      .where(eq(jobs.id, id));
  }

  async markFailed(id: string, error: { code: string; messageKey: string }): Promise<void> {
    await this.db
      .update(jobs)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(eq(jobs.id, id));
  }
}
