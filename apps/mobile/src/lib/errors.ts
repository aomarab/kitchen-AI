import { ApiError, ContractViolationError, NetworkError } from '@kitchen/api-client';
import type { MessageKey } from '@kitchen/i18n';
import { OAuthUnavailableError } from './oauth-errors';

/**
 * Maps any thrown value into an i18n message key. The API only ever sends
 * message keys (never prose) per spec §8, so the UI renders these through the
 * translator. Pure and dependency-light so it is unit-testable in node.
 */
export function errorMessageKey(error: unknown): MessageKey {
  if (error instanceof ApiError) return error.messageKey as MessageKey;
  if (error instanceof NetworkError) return 'errors.offline';
  if (error instanceof OAuthUnavailableError) return error.messageKey;
  if (error instanceof ContractViolationError) return 'errors.INTERNAL_ERROR';
  return 'errors.INTERNAL_ERROR';
}

/** True when retrying the same call could plausibly succeed. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.isRetryable;
  if (error instanceof NetworkError) return true;
  return false;
}

/** True when the error means the session is no longer authenticated. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.isAuthError;
}

/**
 * True when an action failed because the household is out of credits (HTTP 402,
 * spec §7). It is not a transport error but an expected, recoverable state, so
 * the UI answers it by routing to buy credits rather than a bare retry. Handles
 * both a real `ApiError` and the plain `{ code }` envelopes some call sites hand
 * to `ErrorState`.
 */
export function isInsufficientCredits(error: unknown): boolean {
  if (error instanceof ApiError) return error.code === 'INSUFFICIENT_CREDITS';
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'INSUFFICIENT_CREDITS'
  );
}
