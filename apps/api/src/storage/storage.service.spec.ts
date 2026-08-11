import { describe, expect, it } from 'vitest';
import { MAX_CAPTURE_UPLOAD_BYTES, StorageService } from './storage.service.js';
import { AppError } from '../common/errors.js';
import type { Env } from '../config/env.js';

const HOUSEHOLD = '11111111-1111-1111-1111-111111111111';

function makeStorageService(): StorageService {
  // Only the S3 fields are read by the constructor; the URL is signed locally
  // by the SDK, so no network call happens in this spec.
  const env = {
    S3_BUCKET: 'kitchen-test',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test-secret',
  } as unknown as Env;
  return new StorageService(env);
}

describe('presignUpload capture ceiling', () => {
  it('rejects an inventory photo above the capture ceiling', async () => {
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES + 1,
        purpose: 'inventory_photo',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects an oversized receipt too', async () => {
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES + 1,
        purpose: 'receipt',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('allows a resized capture at exactly the ceiling', async () => {
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES,
        purpose: 'inventory_photo',
      }),
    ).resolves.toBeDefined();
  });

  it('leaves non-capture purposes on the wider contract limit', async () => {
    // recipe_image is not a camera capture and keeps the 15 MB contract cap.
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES + 1,
        purpose: 'recipe_image',
      }),
    ).resolves.toBeDefined();
  });
});
