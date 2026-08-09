import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';
import {
  FEEDBACK_DAILY_LIMIT,
  type SubmitFeedbackRequest,
  type SubmitFeedbackResponse,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { feedback } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { toIso } from '../common/serialization.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FeedbackService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Abuse control is a count over this user's last 24 hours rather than a
   * throttler package: the endpoint is authenticated and low-traffic, so the
   * one extra indexed count is cheaper than a new dependency and a Redis
   * bucket. `feedback_user_created_idx` covers it.
   */
  async submit(userId: string, body: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
    const since = new Date(Date.now() - DAY_MS);
    const [recent] = await this.db
      .select({ value: count() })
      .from(feedback)
      .where(and(eq(feedback.userId, userId), gte(feedback.createdAt, since)));

    if ((recent?.value ?? 0) >= FEEDBACK_DAILY_LIMIT) {
      throw new AppError('RATE_LIMITED', 'errors.feedbackRateLimited', {
        limit: FEEDBACK_DAILY_LIMIT,
      });
    }

    const [row] = await this.db
      .insert(feedback)
      .values({
        userId,
        rating: body.rating,
        message: body.message ?? null,
        platform: body.platform,
        appVersion: body.appVersion,
        locale: body.locale,
      })
      .returning({ id: feedback.id, createdAt: feedback.createdAt });

    if (!row) throw new AppError('INTERNAL_ERROR');

    return { id: row.id, createdAt: toIso(row.createdAt) };
  }
}
