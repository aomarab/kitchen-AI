import { and, eq, gte, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../db/index.js';
import { aiUsage } from '../../db/schema.js';
import type { AiOperation } from '../ai.constants.js';

export interface AiUsageRow {
  householdId: string;
  model: string;
  operation: AiOperation | string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** The credit spend this call belongs to; absent when nobody was charged. */
  spendGroupId?: string;
}

/**
 * Narrow persistence port for AI usage/budget accounting, so {@link BudgetService}
 * can be unit-tested with an in-memory fake and integration-tested against the
 * real `ai_usage` table.
 */
export interface UsageRepository {
  todaySpendUsd(householdId: string): Promise<number>;
  todayCallCount(householdId: string): Promise<number>;
  record(row: AiUsageRow): Promise<void>;
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class DrizzleUsageRepository implements UsageRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async todaySpendUsd(householdId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.householdId, householdId), gte(aiUsage.createdAt, startOfUtcDay())));
    return Number(rows[0]?.total ?? 0);
  }

  async todayCallCount(householdId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.householdId, householdId), gte(aiUsage.createdAt, startOfUtcDay())));
    return Number(rows[0]?.count ?? 0);
  }

  async record(row: AiUsageRow): Promise<void> {
    await this.db.insert(aiUsage).values({
      householdId: row.householdId,
      model: row.model,
      operation: row.operation,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd.toFixed(6),
      ...(row.spendGroupId ? { spendGroupId: row.spendGroupId } : {}),
    });
  }
}
