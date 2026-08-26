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
    // AWS SigV4 presigning is pure local HMAC computation and never opens a socket,
    // so no MinIO or network is required for this spec to pass in CI.
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

  it('leaves avatar on the wider contract limit', async () => {
    // avatar is not a camera capture and keeps the 15 MB contract cap.
    await expect(
      makeStorageService().presignUpload(HOUSEHOLD, {
        contentType: 'image/jpeg',
        contentLength: MAX_CAPTURE_UPLOAD_BYTES + 1,
        purpose: 'avatar',
      }),
    ).resolves.toBeDefined();
  });
});

describe('presignCaptureDownload capture-purpose assertion (Issue 3)', () => {
  const CAPTURE_KEY = `households/${HOUSEHOLD}/inventory_photo/abc.jpg`;
  const RECEIPT_KEY = `households/${HOUSEHOLD}/receipt/abc.jpg`;
  const RECIPE_KEY = `households/${HOUSEHOLD}/recipe_image/abc.jpg`;
  const AVATAR_KEY = `households/${HOUSEHOLD}/avatar/abc.jpg`;
  const OTHER_HH = '22222222-2222-2222-2222-222222222222';

  it('presigns a genuine capture key', async () => {
    await expect(makeStorageService().presignCaptureDownload(HOUSEHOLD, CAPTURE_KEY)).resolves.toContain(
      'inventory_photo',
    );
    await expect(makeStorageService().presignCaptureDownload(HOUSEHOLD, RECEIPT_KEY)).resolves.toBeDefined();
  });

  it('rejects a recipe_image key smuggled onto the recognize path', async () => {
    // The whole bypass: upload 15 MB under recipe_image, then hand that key to
    // recognize. The capture-purpose assertion must reject it.
    await expect(
      makeStorageService().presignCaptureDownload(HOUSEHOLD, RECIPE_KEY),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects an avatar key on the capture path', async () => {
    await expect(
      makeStorageService().presignCaptureDownload(HOUSEHOLD, AVATAR_KEY),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('still rejects another household’s key', async () => {
    await expect(
      makeStorageService().presignCaptureDownload(HOUSEHOLD, `households/${OTHER_HH}/inventory_photo/abc.jpg`),
    ).rejects.toBeInstanceOf(AppError);
  });
});
