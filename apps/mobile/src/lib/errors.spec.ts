import { describe, expect, it } from 'vitest';
import { ApiError, ContractViolationError, NetworkError } from '@kitchen/api-client';
import {
  errorMessageKey,
  isAuthError,
  isInsufficientCredits,
  isRetryable,
  jobErrorKey,
} from '../lib/errors';

describe('errorMessageKey', () => {
  it('renders the server-supplied message key for an ApiError', () => {
    const error = new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.RATE_LIMITED' });
    expect(errorMessageKey(error)).toBe('errors.RATE_LIMITED');
  });

  it('maps a NetworkError to the offline key', () => {
    expect(errorMessageKey(new NetworkError('offline'))).toBe('errors.offline');
  });

  it('maps a contract violation to an internal error', () => {
    expect(errorMessageKey(new ContractViolationError('getRecipe', []))).toBe(
      'errors.INTERNAL_ERROR',
    );
  });

  it('falls back to internal error for unknown throwables', () => {
    expect(errorMessageKey('boom')).toBe('errors.INTERNAL_ERROR');
  });
});

describe('isRetryable', () => {
  it('is true for rate limiting and network failures', () => {
    expect(
      isRetryable(new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.RATE_LIMITED' })),
    ).toBe(true);
    expect(isRetryable(new NetworkError('offline'))).toBe(true);
  });

  it('is false for a validation error', () => {
    expect(
      isRetryable(
        new ApiError(422, { code: 'VALIDATION_FAILED', messageKey: 'errors.VALIDATION_FAILED' }),
      ),
    ).toBe(false);
  });
});

describe('isAuthError', () => {
  it('is true only for an unauthenticated ApiError', () => {
    expect(
      isAuthError(
        new ApiError(401, { code: 'UNAUTHENTICATED', messageKey: 'errors.UNAUTHENTICATED' }),
      ),
    ).toBe(true);
    expect(isAuthError(new NetworkError('offline'))).toBe(false);
  });
});

describe('isInsufficientCredits', () => {
  it('is true for a 402 INSUFFICIENT_CREDITS ApiError', () => {
    expect(
      isInsufficientCredits(
        new ApiError(402, {
          code: 'INSUFFICIENT_CREDITS',
          messageKey: 'errors.INSUFFICIENT_CREDITS',
        }),
      ),
    ).toBe(true);
  });

  it('is true for a plain {code} envelope handed to ErrorState', () => {
    expect(
      isInsufficientCredits({
        code: 'INSUFFICIENT_CREDITS',
        messageKey: 'errors.INSUFFICIENT_CREDITS',
      }),
    ).toBe(true);
  });

  it('is false for any other error code or type', () => {
    expect(
      isInsufficientCredits(
        new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.RATE_LIMITED' }),
      ),
    ).toBe(false);
    expect(isInsufficientCredits(new NetworkError('offline'))).toBe(false);
    expect(isInsufficientCredits({ code: 'NOT_FOUND' })).toBe(false);
    expect(isInsufficientCredits(null)).toBe(false);
    expect(isInsufficientCredits('INSUFFICIENT_CREDITS')).toBe(false);
  });
});

describe('jobErrorKey', () => {
  it('prefers the reason the server gave for the failure', () => {
    // A household told "there isn't enough in your kitchen" can act on it;
    // the generic fallback only invites them to retry the same doomed job.
    expect(
      jobErrorKey({ code: 'PLAN_INFEASIBLE', messageKey: 'errors.PLAN_INFEASIBLE' }, 'errors.INTERNAL_ERROR'),
    ).toBe('errors.PLAN_INFEASIBLE');
  });

  it('falls back when a newer server names a message this build lacks', () => {
    // `translate` would otherwise render the raw key at the user.
    expect(jobErrorKey({ code: 'X', messageKey: 'errors.notInThisBuild' }, 'errors.INTERNAL_ERROR')).toBe(
      'errors.INTERNAL_ERROR',
    );
  });

  it('falls back when the job carries no error at all', () => {
    expect(jobErrorKey(null, 'errors.INTERNAL_ERROR')).toBe('errors.INTERNAL_ERROR');
    expect(jobErrorKey(undefined, 'errors.INTERNAL_ERROR')).toBe('errors.INTERNAL_ERROR');
    expect(jobErrorKey({}, 'errors.INTERNAL_ERROR')).toBe('errors.INTERNAL_ERROR');
  });
});
