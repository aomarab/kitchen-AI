import { useMutation, useQuery } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { uuidv4 } from '../lib/uuid';
import { qk } from './keys';

/** Ask the API for a presigned upload URL before sending a photo. */
export function usePresignUpload() {
  return useMutation({
    mutationFn: (body: RouteBody<'presignUpload'>) => api.call('presignUpload', { body }),
  });
}

/** Run vision recognition over uploaded photos → a review session. */
export function useRecognizePhotos() {
  return useMutation({
    mutationFn: (body: RouteBody<'recognizePhotos'>) => api.call('recognizePhotos', { body }),
  });
}

/** Look up a scanned/typed barcode. */
export function useBarcodeLookup() {
  return useMutation({
    mutationFn: (barcode: string) => api.call('lookupBarcode', { query: { barcode } }),
  });
}

/** Kick off receipt parsing — returns a job to poll. */
export function useParseReceipt() {
  return useMutation({
    mutationFn: (body: RouteBody<'parseReceipt'>) =>
      api.call('parseReceipt', { body, idempotencyKey: uuidv4() }),
  });
}

/** Re-fetch a recognition session (e.g. after navigating back into review). */
export function useRecognitionSession(id: string | null) {
  return useQuery({
    queryKey: qk.recognition(id ?? 'none'),
    queryFn: () => api.call('getRecognitionSession', { params: { id: id! } }),
    enabled: !!id,
  });
}
