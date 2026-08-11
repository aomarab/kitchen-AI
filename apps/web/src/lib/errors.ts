import { ApiError, ContractViolationError, NetworkError, TimeoutError } from '@kitchen/api-client';

/**
 * Every failure the UI can render resolves to an i18n key — the server never
 * sends prose (spec §8). Falls back sensibly for transport-level failures.
 */
export function resolveErrorKey(error: unknown): string {
  if (error instanceof ApiError) return error.messageKey;
  // Before NetworkError: TimeoutError extends it, and a request that reached
  // the server and ran long is not an offline connection.
  if (error instanceof TimeoutError) return 'errors.timedOut';
  if (error instanceof NetworkError) return 'errors.offline';
  if (error instanceof ContractViolationError) return 'errors.INTERNAL_ERROR';
  return 'errors.INTERNAL_ERROR';
}

/**
 * True when an action failed because the household is out of credits (HTTP 402,
 * spec §7). It is not a transport error but an expected, recoverable state, so
 * the UI answers it with a route to top up rather than a bare "try again".
 * Handles both a real `ApiError` and the plain `{ code }` envelopes some call
 * sites hand to `ErrorState`.
 */
export function isInsufficientCredits(error: unknown): boolean {
  if (error instanceof ApiError) return error.code === 'INSUFFICIENT_CREDITS';
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'INSUFFICIENT_CREDITS'
  );
}
