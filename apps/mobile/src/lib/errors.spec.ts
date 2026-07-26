import { describe, expect, it } from 'vitest';
import { ApiError, ContractViolationError, NetworkError } from '@kitchen/api-client';
import { errorMessageKey, isAuthError, isRetryable } from '../lib/errors';

describe('errorMessageKey', () => {
  it('renders the server-supplied message key for an ApiError', () => {
    const error = new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.RATE_LIMITED' });
    expect(errorMessageKey(error)).toBe('errors.RATE_LIMITED');
  });

  it('maps a NetworkError to the offline key', () => {
    expect(errorMessageKey(new NetworkError('offline'))).toBe('errors.offline');
  });

  it('maps a contract violation to an internal error', () => {
    expect(errorMessageKey(new ContractViolationError('getRecipe', []))).toBe('errors.INTERNAL_ERROR');
  });

  it('falls back to internal error for unknown throwables', () => {
    expect(errorMessageKey('boom')).toBe('errors.INTERNAL_ERROR');
  });
});

describe('isRetryable', () => {
  it('is true for rate limiting and network failures', () => {
    expect(isRetryable(new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.RATE_LIMITED' }))).toBe(true);
    expect(isRetryable(new NetworkError('offline'))).toBe(true);
  });

  it('is false for a validation error', () => {
    expect(
      isRetryable(new ApiError(422, { code: 'VALIDATION_FAILED', messageKey: 'errors.VALIDATION_FAILED' })),
    ).toBe(false);
  });
});

describe('isAuthError', () => {
  it('is true only for an unauthenticated ApiError', () => {
    expect(
      isAuthError(new ApiError(401, { code: 'UNAUTHENTICATED', messageKey: 'errors.UNAUTHENTICATED' })),
    ).toBe(true);
    expect(isAuthError(new NetworkError('offline'))).toBe(false);
  });
});
