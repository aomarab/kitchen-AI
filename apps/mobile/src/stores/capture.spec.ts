import { beforeEach, describe, expect, it } from 'vitest';
import type { RecognitionSession } from '@kitchen/contracts';
import { useCaptureStore } from './capture';
import type { CapturedPhoto } from '../lib/capture';

function session(): RecognitionSession {
  return { id: 'sess-1', items: [], emptyPhotoKeys: [], createdAt: '2026-09-27T10:00:00.000Z' };
}

const photos: CapturedPhoto[] = [
  { uri: 'file://a.jpg', width: 640, height: 480, photoKey: 'key-a' },
];

beforeEach(() => {
  useCaptureStore.setState({ session: null, source: 'photo', photos: [] });
});

describe('useCaptureStore capture photos', () => {
  it('stores the captured photo mapping with the recognition session', () => {
    useCaptureStore.getState().setSession(session(), 'photo', photos);

    expect(useCaptureStore.getState().photos).toEqual(photos);
  });

  it('defaults photos to an empty list for sessions that do not carry photo pins', () => {
    useCaptureStore.getState().setSession(session(), 'receipt');

    expect(useCaptureStore.getState().photos).toEqual([]);
  });

  it('clears photos when the capture state resets', () => {
    useCaptureStore.getState().setSession(session(), 'photo', photos);

    useCaptureStore.getState().reset();

    expect(useCaptureStore.getState().session).toBeNull();
    expect(useCaptureStore.getState().photos).toEqual([]);
  });
});
