import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError, TimeoutError } from '@kitchen/api-client';
import { captureErrorKey } from './capture-error';
import { PhotoUploadError } from './upload';

const apiError = (code: string, messageKey: string, status = 400) =>
  new ApiError(status, { code, messageKey } as never);

describe('captureErrorKey', () => {
  it('blames the upload only when the photo really failed to send', () => {
    expect(captureErrorKey(new PhotoUploadError('unreadable', 'file:///a.jpg'))).toBe(
      'mobile.capture.uploadFailed',
    );
    expect(captureErrorKey(new PhotoUploadError('rejected', '403 for k'))).toBe(
      'mobile.capture.uploadFailed',
    );
  });

  it('reports a recognition timeout as a timeout, not a connection problem', () => {
    // The regression: the photo uploaded fine and the server finished the work
    // (and charged a credit); only the client gave up waiting.
    expect(captureErrorKey(new TimeoutError('too slow', 180_000))).toBe('errors.timedOut');
  });

  it('still reports a genuine transport failure as offline', () => {
    expect(captureErrorKey(new NetworkError('no route to host'))).toBe('errors.offline');
  });

  it('surfaces the server reason so the user can act on it', () => {
    expect(
      captureErrorKey(apiError('INSUFFICIENT_CREDITS', 'errors.INSUFFICIENT_CREDITS', 402)),
    ).toBe('errors.INSUFFICIENT_CREDITS');
    expect(captureErrorKey(apiError('AI_NO_RESULT', 'errors.AI_NO_RESULT'))).toBe(
      'errors.AI_NO_RESULT',
    );
    expect(captureErrorKey(apiError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', 503))).toBe(
      'errors.AI_UNAVAILABLE',
    );
  });

  it('falls back to a generic message for anything unrecognised', () => {
    expect(captureErrorKey(new Error('boom'))).toBe('errors.INTERNAL_ERROR');
  });
});
