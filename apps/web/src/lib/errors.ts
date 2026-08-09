import { ApiError, ContractViolationError, NetworkError } from '@kitchen/api-client';

/**
 * Every failure the UI can render resolves to an i18n key — the server never
 * sends prose (spec §8). Falls back sensibly for transport-level failures.
 */
export function resolveErrorKey(error: unknown): string {
  if (error instanceof ApiError) return error.messageKey;
  if (error instanceof NetworkError) return 'errors.offline';
  if (error instanceof ContractViolationError) return 'errors.INTERNAL_ERROR';
  return 'errors.INTERNAL_ERROR';
}
