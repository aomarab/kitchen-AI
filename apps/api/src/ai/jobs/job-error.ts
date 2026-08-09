import type { ErrorCode } from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';

/** Normalizes any thrown value into the persisted job error shape (spec §3.3). */
export function toJobError(err: unknown): { code: ErrorCode; messageKey: string } {
  if (err instanceof AppError) {
    return { code: err.code, messageKey: err.messageKey };
  }
  return { code: 'INTERNAL_ERROR', messageKey: 'errors.INTERNAL_ERROR' };
}

/**
 * The persisted job error is deliberately narrow — it crosses the wire to a
 * client, so it carries a code and a message key and nothing else. That leaves
 * an operator with no way at all to tell *why* an AI job failed: the schema
 * issues, the truncation reason and the model id all live in `details`, which
 * is dropped. This renders the same error for the server log, where the detail
 * is safe and is the only diagnosis available after the fact.
 */
export function describeJobError(err: unknown): string {
  if (err instanceof AppError) {
    const details = err.details ? ` ${JSON.stringify(err.details)}` : '';
    return `${err.code}${details}`;
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
