import type { MessageKey } from '@kitchen/i18n';
import { errorMessageKey } from './errors';
import { PhotoUploadError } from './upload';

/**
 * Picks the message for a failed capture submission.
 *
 * Capture runs two very different halves: bytes to object storage, then a
 * recognition request to the API. Only the first half can fail to *send* a
 * photo. Reporting the whole flow as an upload failure told users to check a
 * connection that was fine, while hiding the real reason — out of credits, the
 * model erroring, or the call outrunning its budget after the server had
 * already done (and charged for) the work.
 */
export function captureErrorKey(error: unknown): MessageKey {
  if (error instanceof PhotoUploadError) return 'mobile.capture.uploadFailed';
  return errorMessageKey(error);
}
