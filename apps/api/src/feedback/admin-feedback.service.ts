import { Inject, Injectable } from '@nestjs/common';
import { and, avg, count, desc, eq, type SQL } from 'drizzle-orm';
import {
  feedbackStatusSchema,
  type FeedbackDetail,
  type FeedbackStats,
  type FeedbackSummary,
  type ListFeedbackQuery,
  type UpdateFeedbackRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { feedback, users } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage, type Page } from '../common/pagination.js';
import { toIso, toNumber } from '../common/serialization.js';

/** Row shape shared by the list and detail queries. */
type FeedbackRow = typeof feedback.$inferSelect;

function toSummary(row: FeedbackRow): FeedbackSummary {
  return {
    id: row.id,
    rating: row.rating,
    message: row.message,
    platform: row.platform,
    appVersion: row.appVersion,
    locale: row.locale,
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}

@Injectable()
export class AdminFeedbackService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListFeedbackQuery): Promise<Page<FeedbackSummary>> {
    const offset = decodeCursor(query.cursor);
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(feedback.status, query.status));
    if (query.rating !== undefined) filters.push(eq(feedback.rating, query.rating));
    if (query.platform) filters.push(eq(feedback.platform, query.platform));

    const rows = await this.db
      .select()
      .from(feedback)
      .where(filters.length ? and(...filters) : undefined)
      // `id` breaks ties so two rows written in the same millisecond cannot
      // swap places between pages and drop a row from the result.
      .orderBy(desc(feedback.createdAt), desc(feedback.id))
      .limit(query.limit + 1)
      .offset(offset);

    return toPage(rows.map(toSummary), offset, query.limit);
  }

  async get(id: string): Promise<FeedbackDetail> {
    const [row] = await this.db
      .select({ item: feedback, submitter: users })
      .from(feedback)
      .innerJoin(users, eq(users.id, feedback.userId))
      .where(eq(feedback.id, id))
      .limit(1);

    if (!row) throw AppError.notFound();

    return {
      ...toSummary(row.item),
      adminNote: row.item.adminNote,
      reviewedAt: row.item.reviewedAt ? toIso(row.item.reviewedAt) : null,
      submitter: {
        id: row.submitter.id,
        email: row.submitter.email,
        displayName: row.submitter.displayName,
        locale: row.submitter.locale,
        joinedAt: toIso(row.submitter.createdAt),
      },
    };
  }

  /**
   * Triage is status plus an internal note. Nothing here is sent to the user —
   * there is no reply channel in v1.
   */
  async update(reviewerId: string, id: string, body: UpdateFeedbackRequest): Promise<FeedbackDetail> {
    const [updated] = await this.db
      .update(feedback)
      .set({
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.adminNote !== undefined ? { adminNote: body.adminNote } : {}),
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id });

    if (!updated) throw AppError.notFound();

    return this.get(id);
  }

  async stats(): Promise<FeedbackStats> {
    const [totals] = await this.db
      .select({ total: count(), average: avg(feedback.rating) })
      .from(feedback);

    const statusRows = await this.db
      .select({ status: feedback.status, value: count() })
      .from(feedback)
      .groupBy(feedback.status);

    const ratingRows = await this.db
      .select({ rating: feedback.rating, value: count() })
      .from(feedback)
      .groupBy(feedback.rating);

    // Every bucket is present at zero so the console renders a stable strip
    // rather than a row of holes that shifts as feedback arrives.
    const byStatus = Object.fromEntries(
      feedbackStatusSchema.options.map((status) => [
        status,
        statusRows.find((r) => r.status === status)?.value ?? 0,
      ]),
    ) as FeedbackStats['byStatus'];

    const byRating = Object.fromEntries(
      [1, 2, 3, 4, 5].map((rating) => [
        String(rating),
        ratingRows.find((r) => r.rating === rating)?.value ?? 0,
      ]),
    );

    return {
      total: totals?.total ?? 0,
      // `avg` comes back as a numeric string, and as null on an empty table.
      averageRating: totals?.average == null ? null : Math.round(toNumber(totals.average) * 100) / 100,
      byStatus,
      byRating,
    };
  }
}
