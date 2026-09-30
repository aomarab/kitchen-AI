import { describe, expect, it } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import type { RecognitionSession } from '@kitchen/contracts';
import { deriveCaptureFlowState } from './capture-flow';

function session(): RecognitionSession {
  return { id: 'sess-1', items: [], emptyPhotoKeys: [], createdAt: '2026-09-27T10:00:00.000Z' };
}

const nothingFound = () =>
  new ApiError(400, { code: 'AI_NO_RESULT', messageKey: 'errors.AI_NO_RESULT' } as never);

describe('deriveCaptureFlowState', () => {
  it('starts in framing when there are no photos', () => {
    expect(
      deriveCaptureFlowState({ mode: 'photo', photoCount: 0, busy: false, session: null }),
    ).toBe('framing');
  });

  it('moves to shot after a photo has been captured and the flow is idle', () => {
    expect(
      deriveCaptureFlowState({ mode: 'photo', photoCount: 1, busy: false, session: null }),
    ).toBe('shot');
  });

  it('uses looking while a captured photo is uploading or being recognised', () => {
    expect(
      deriveCaptureFlowState({ mode: 'receipt', photoCount: 1, busy: true, session: null }),
    ).toBe('looking');
  });

  it('keeps photo results on the capture screen once a session exists', () => {
    expect(
      deriveCaptureFlowState({ mode: 'photo', photoCount: 2, busy: false, session: session() }),
    ).toBe('result');
  });

  it('does not create a receipt result state because receipt still routes to review', () => {
    expect(
      deriveCaptureFlowState({ mode: 'receipt', photoCount: 1, busy: false, session: session() }),
    ).toBe('shot');
  });

  it('branches no-result API errors into the nothing-found state before generic errors', () => {
    expect(
      deriveCaptureFlowState({
        mode: 'photo',
        photoCount: 1,
        busy: false,
        session: null,
        lastError: nothingFound(),
      }),
    ).toBe('nothingFound');
  });

  it('leaves other errors in the shot state so the bubble can show the error line', () => {
    expect(
      deriveCaptureFlowState({
        mode: 'photo',
        photoCount: 1,
        busy: false,
        session: null,
        lastError: new Error('boom'),
      }),
    ).toBe('shot');
  });
});
