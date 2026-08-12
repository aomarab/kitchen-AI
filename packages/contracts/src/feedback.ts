import { z } from 'zod';
import { isoDateTimeSchema, localeSchema, paginationQuerySchema, uuidSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

/** Global account role. Promotion to `staff` happens by SQL only — no route sets this. */
export const userRoleSchema = z.enum(['user', 'staff']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const feedbackStatusSchema = z.enum(['new', 'triaged', 'resolved', 'wont_fix']);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

export const feedbackPlatformSchema = z.enum(['ios', 'android', 'web']);
export type FeedbackPlatform = z.infer<typeof feedbackPlatformSchema>;

/** Stored as `smallint` with a CHECK constraint; mirrored here so clients cannot send 0 or 6. */
export const feedbackRatingSchema = z.number().int().min(1).max(5);

/** Longer messages are truncated by no one — they are rejected, so the limit is a contract. */
export const FEEDBACK_MESSAGE_MAX = 2000;

/** Submissions allowed per user per rolling 24 hours. The API rejects the next one. */
export const FEEDBACK_DAILY_LIMIT = 5;

/* ------------------------------------------------------------------ */
/* Submission                                                          */
/* ------------------------------------------------------------------ */

/**
 * `platform`, `appVersion` and `locale` are sent by the client because only the
 * client knows them, and validated here so a bad build cannot poison the table.
 * A rating with no message is valid; a message with no rating is not.
 */
export const submitFeedbackRequestSchema = z.object({
  rating: feedbackRatingSchema,
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX).optional(),
  platform: feedbackPlatformSchema,
  appVersion: z.string().min(1).max(32),
  locale: localeSchema,
});
export type SubmitFeedbackRequest = z.infer<typeof submitFeedbackRequestSchema>;

/** There is no "my feedback" view, so the client needs nothing but the receipt. */
export const submitFeedbackResponseSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
});
export type SubmitFeedbackResponse = z.infer<typeof submitFeedbackResponseSchema>;

/* ------------------------------------------------------------------ */
/* Admin views                                                         */
/* ------------------------------------------------------------------ */

export const feedbackSummarySchema = z.object({
  id: uuidSchema,
  rating: feedbackRatingSchema,
  message: z.string().nullable(),
  platform: feedbackPlatformSchema,
  appVersion: z.string(),
  locale: localeSchema,
  status: feedbackStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;

/**
 * Adds the agreed limit of customer data: who sent it and when they joined.
 * Deliberately no household, inventory or meal-plan data.
 */
export const feedbackDetailSchema = feedbackSummarySchema.extend({
  adminNote: z.string().nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  submitter: z.object({
    id: uuidSchema,
    email: z.string().email(),
    displayName: z.string(),
    locale: localeSchema,
    joinedAt: isoDateTimeSchema,
  }),
});
export type FeedbackDetail = z.infer<typeof feedbackDetailSchema>;

export const listFeedbackQuerySchema = paginationQuerySchema.extend({
  status: feedbackStatusSchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  platform: feedbackPlatformSchema.optional(),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

/**
 * Any status may replace any other — there is no state machine. At least one
 * field must be present, so a no-op PATCH cannot silently stamp a reviewer.
 */
export const updateFeedbackRequestSchema = z
  .object({
    status: feedbackStatusSchema.optional(),
    adminNote: z.string().max(FEEDBACK_MESSAGE_MAX).nullable().optional(),
  })
  .refine((body) => body.status !== undefined || body.adminNote !== undefined, {
    message: 'At least one of status or adminNote is required',
  });
export type UpdateFeedbackRequest = z.infer<typeof updateFeedbackRequestSchema>;

export const feedbackStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  /** `null` when there is nothing to average. */
  averageRating: z.number().nullable(),
  byStatus: z.record(feedbackStatusSchema, z.number().int().nonnegative()),
  /** Keyed '1'…'5'. */
  byRating: z.record(z.string(), z.number().int().nonnegative()),
});
export type FeedbackStats = z.infer<typeof feedbackStatsSchema>;

/* ------------------------------------------------------------------ */
/* Product feedback                                                    */
/* ------------------------------------------------------------------ */

/**
 * What the household thinks of a product they bought, which we report to the
 * brand that made it.
 *
 * The request carries no product identity. The route names an inventory item
 * and the server resolves the ingredient and brand from it, so a client cannot
 * attach a one-star review to a competitor's brand — the only products you can
 * rate are the ones in your own kitchen.
 */
export const submitProductFeedbackRequestSchema = z.object({
  rating: feedbackRatingSchema,
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX).optional(),
  locale: localeSchema,
});
export type SubmitProductFeedbackRequest = z.infer<typeof submitProductFeedbackRequestSchema>;

/** One person's review of one product. `brand` is null for unbranded food. */
export const productFeedbackSchema = z.object({
  id: uuidSchema,
  ingredientId: uuidSchema,
  brand: z.string().nullable(),
  rating: feedbackRatingSchema,
  message: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type ProductFeedback = z.infer<typeof productFeedbackSchema>;

/**
 * What the item screen needs: the reader's own review so it can be shown and
 * changed, plus how everyone else rated the same product.
 *
 * `count` travels with `averageRating` deliberately — 5.0 from one person and
 * 5.0 from four hundred are different claims, and a bare average hides which
 * one you are looking at.
 */
export const productFeedbackSummarySchema = z.object({
  mine: productFeedbackSchema.nullable(),
  averageRating: z.number().nullable(),
  count: z.number().int().nonnegative(),
});
export type ProductFeedbackSummary = z.infer<typeof productFeedbackSummarySchema>;

/* ------------------------------------------------------------------ */
/* Product feedback — admin/vendor views                               */
/* ------------------------------------------------------------------ */

/**
 * One row of the vendor report: a product, who makes it, and how it is rated.
 *
 * Both catalog names travel because the vendor report is read by staff in
 * either language, and the ingredient name is the only thing identifying
 * *what* was reviewed.
 */
export const productFeedbackRowSchema = z.object({
  ingredientId: uuidSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  /** `null` groups every unbranded review of this product together. */
  brand: z.string().nullable(),
  count: z.number().int().nonnegative(),
  averageRating: z.number(),
  /** Keyed '1'…'5'; absent keys mean nobody gave that rating. */
  byRating: z.record(z.string(), z.number().int().nonnegative()),
  /** How many of the reviews left a written comment. */
  commentCount: z.number().int().nonnegative(),
});
export type ProductFeedbackRow = z.infer<typeof productFeedbackRowSchema>;

export const listProductFeedbackQuerySchema = paginationQuerySchema.extend({
  /** Case-insensitive exact match, because barcode sources vary the casing. */
  brand: z.string().min(1).max(120).optional(),
  ingredientId: uuidSchema.optional(),
  /** Only products whose average is at or below this — the ones to act on. */
  maxAverage: z.coerce.number().min(1).max(5).optional(),
});
export type ListProductFeedbackQuery = z.infer<typeof listProductFeedbackQuerySchema>;

/**
 * The comments themselves — what a vendor is actually sent.
 *
 * No submitter identity. A vendor gets the opinion, not the customer: the
 * report exists to improve a product, and handing a company the email address
 * of someone who criticised it is a different transaction than the one the
 * customer agreed to.
 */
export const productCommentSchema = z.object({
  id: uuidSchema,
  rating: feedbackRatingSchema,
  message: z.string(),
  locale: localeSchema,
  createdAt: isoDateTimeSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  brand: z.string().nullable(),
});
export type ProductComment = z.infer<typeof productCommentSchema>;

export const listProductCommentsQuerySchema = paginationQuerySchema.extend({
  brand: z.string().min(1).max(120).optional(),
  ingredientId: uuidSchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});
export type ListProductCommentsQuery = z.infer<typeof listProductCommentsQuerySchema>;
