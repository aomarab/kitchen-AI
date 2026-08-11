import type { CaptureSource } from '../../stores/capture';

/**
 * How many photos a capture request accepts. These mirror the caps baked into
 * `recognizeRequestSchema` and `parseReceiptRequestSchema` in @kitchen/contracts
 * so the camera can stop the user at the limit, rather than uploading photos
 * the request would then drop on the floor. `limits.spec.ts` fails if either
 * number drifts away from the contract.
 */
export const MAX_INVENTORY_PHOTOS = 10;
export const MAX_RECEIPT_PHOTOS = 5;

export function maxPhotosFor(mode: CaptureSource): number {
  return mode === 'receipt' ? MAX_RECEIPT_PHOTOS : MAX_INVENTORY_PHOTOS;
}
