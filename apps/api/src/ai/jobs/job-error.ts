import type { ErrorCode } from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';

/** Normalizes any thrown value into the persisted job error shape (spec §3.3). */
export function toJobError(err: unknown): { code: ErrorCode; messageKey: string } {
  if (err instanceof AppError) {
    return { code: err.code, messageKey: err.messageKey };
  }
  return { code: 'INTERNAL_ERROR', messageKey: 'errors.INTERNAL_ERROR' };
}
