import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_DAILY_LIMIT,
  FEEDBACK_MESSAGE_MAX,
  listFeedbackQuerySchema,
  submitFeedbackRequestSchema,
  updateFeedbackRequestSchema,
} from './feedback.js';
import { routes } from './routes.js';

const valid = {
  rating: 4,
  message: 'The pantry scan missed my olive oil.',
  platform: 'ios' as const,
  appVersion: '1.0.0',
  locale: 'en' as const,
};

describe('submitFeedbackRequestSchema', () => {
  it('accepts the boundary ratings', () => {
    expect(submitFeedbackRequestSchema.safeParse({ ...valid, rating: 1 }).success).toBe(true);
    expect(submitFeedbackRequestSchema.safeParse({ ...valid, rating: 5 }).success).toBe(true);
  });

  it('rejects ratings outside 1-5 and non-integers', () => {
    for (const rating of [0, 6, 2.5, -1]) {
      expect(submitFeedbackRequestSchema.safeParse({ ...valid, rating }).success).toBe(false);
    }
  });

  it('accepts a rating with no message but not a message with no rating', () => {
    const { message: _message, ...noMessage } = valid;
    expect(submitFeedbackRequestSchema.safeParse(noMessage).success).toBe(true);
    const { rating: _rating, ...noRating } = valid;
    expect(submitFeedbackRequestSchema.safeParse(noRating).success).toBe(false);
  });

  it('caps the message length', () => {
    const long = { ...valid, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) };
    expect(submitFeedbackRequestSchema.safeParse(long).success).toBe(false);
    const atLimit = { ...valid, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX) };
    expect(submitFeedbackRequestSchema.safeParse(atLimit).success).toBe(true);
  });

  it('rejects an unknown platform', () => {
    expect(submitFeedbackRequestSchema.safeParse({ ...valid, platform: 'windows' }).success).toBe(false);
  });

  it('exposes the daily limit the API enforces', () => {
    expect(FEEDBACK_DAILY_LIMIT).toBe(5);
  });
});

describe('listFeedbackQuerySchema', () => {
  it('defaults the limit and leaves every filter optional', () => {
    const parsed = listFeedbackQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.status).toBeUndefined();
  });

  it('coerces a numeric rating filter from a query string', () => {
    expect(listFeedbackQuerySchema.parse({ rating: '3' }).rating).toBe(3);
  });
});

describe('updateFeedbackRequestSchema', () => {
  it('rejects an empty patch so a no-op cannot stamp a reviewer', () => {
    expect(updateFeedbackRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts either field alone', () => {
    expect(updateFeedbackRequestSchema.safeParse({ status: 'triaged' }).success).toBe(true);
    expect(updateFeedbackRequestSchema.safeParse({ adminNote: 'Duplicate.' }).success).toBe(true);
  });
});

describe('feedback routes', () => {
  it('registers the user route without a household requirement', () => {
    expect(routes.submitFeedback).toMatchObject({
      method: 'POST',
      path: '/feedback',
      auth: true,
      household: false,
    });
  });

  it('marks every admin route staff-only', () => {
    const admin = ['adminListFeedback', 'adminGetFeedback', 'adminUpdateFeedback', 'adminFeedbackStats'] as const;
    for (const name of admin) {
      expect(routes[name].staff).toBe(true);
      expect(routes[name].auth).toBe(true);
      expect(routes[name].household).toBe(false);
    }
  });

  it('puts the stats path ahead of the :id path so Nest does not match "stats" as an id', () => {
    const names = Object.keys(routes);
    expect(names.indexOf('adminFeedbackStats')).toBeLessThan(names.indexOf('adminGetFeedback'));
  });
});
