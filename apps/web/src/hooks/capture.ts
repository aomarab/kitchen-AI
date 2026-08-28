import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkCreateInventoryRequest,
  PresignUploadRequest,
  RecognizeRequest,
} from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';
import { uuid } from '../lib/uuid';

export function useRecognitionSession(id: string | null) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['recognition-session', id],
    queryFn: () => api.call('getRecognitionSession', { params: { id: id! } }),
    enabled: ready && Boolean(id),
  });
}

export function useRecognize() {
  return useMutation({
    mutationFn: (body: RecognizeRequest) => api.call('recognizePhotos', { body }),
  });
}

export function useLookupBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => api.call('lookupBarcode', { query: { barcode } }),
  });
}

export function useParseReceipt() {
  return useMutation({
    mutationFn: (photoKeys: string[]) =>
      api.call('parseReceipt', { body: { photoKeys }, idempotencyKey: uuid() }),
  });
}

export function usePresignUpload() {
  return useMutation({
    mutationFn: (body: PresignUploadRequest) => api.call('presignUpload', { body }),
  });
}

export function useBulkCreateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkCreateInventoryRequest) => api.call('bulkCreateInventory', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
}
