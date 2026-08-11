import { describe, expect, it } from 'vitest';
import { parseReceiptRequestSchema, recognizeRequestSchema } from '@kitchen/contracts';
import { MAX_INVENTORY_PHOTOS, MAX_RECEIPT_PHOTOS, maxPhotosFor } from './limits';

const keys = (count: number) => Array.from({ length: count }, (_, i) => `photo-${i}.jpg`);

describe('capture photo limits', () => {
  it('matches the inventory recognition contract exactly', () => {
    expect(
      recognizeRequestSchema.safeParse({ photoKeys: keys(MAX_INVENTORY_PHOTOS) }).success,
    ).toBe(true);
    expect(
      recognizeRequestSchema.safeParse({ photoKeys: keys(MAX_INVENTORY_PHOTOS + 1) }).success,
    ).toBe(false);
  });

  it('matches the receipt parsing contract exactly', () => {
    expect(
      parseReceiptRequestSchema.safeParse({ photoKeys: keys(MAX_RECEIPT_PHOTOS) }).success,
    ).toBe(true);
    expect(
      parseReceiptRequestSchema.safeParse({ photoKeys: keys(MAX_RECEIPT_PHOTOS + 1) }).success,
    ).toBe(false);
  });

  it('maps each capture mode to its own cap', () => {
    expect(maxPhotosFor('photo')).toBe(MAX_INVENTORY_PHOTOS);
    expect(maxPhotosFor('receipt')).toBe(MAX_RECEIPT_PHOTOS);
  });
});
