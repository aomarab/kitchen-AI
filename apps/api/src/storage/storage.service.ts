import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignUploadRequest, PresignUploadResponse } from '@kitchen/contracts';
import { AppError } from '../common/errors.js';
import { ENV, type Env } from '../config/env.js';

const EXPIRES_IN_SECONDS = 300;

/**
 * Camera captures are resized client-side to MAX_IMAGE_EDGE_PX before upload.
 * The contract's 15 MB cap is far too loose to notice a client that skipped
 * that step, and an un-resized frame costs real money on the vision tier, so
 * capture purposes get their own ceiling. A 1024px JPEG at quality 0.7 lands
 * well under this.
 */
export const MAX_CAPTURE_UPLOAD_BYTES = 2 * 1024 * 1024;

const CAPTURE_PURPOSES = new Set(['inventory_photo', 'receipt']);

const EXTENSION: Record<PresignUploadRequest['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Every object a household owns lives under this prefix. */
export function householdPrefix(householdId: string): string {
  return `households/${householdId}/`;
}

/**
 * Rejects any object key the household does not own.
 *
 * Object keys travel back to the API as opaque client strings (`photoKeys` on
 * recognize and receipt-parse), so without this a caller could name another
 * household's photo — or an arbitrary `https://` URL — and have the server
 * fetch it on their behalf.
 */
export function assertOwnedKey(householdId: string, key: string): void {
  if (!key.startsWith(householdPrefix(householdId)) || key.includes('..')) {
    throw AppError.notFound('errors.NOT_FOUND');
  }
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }

  /**
   * Presign a single PUT. The key is scoped under the household prefix so a
   * signed URL can never target another household's objects. See spec §11.
   *
   * `ContentLength` is signed too, so the contract's 15 MB cap is actually
   * enforced by S3 — an unsigned length would let the URL accept an object of
   * any size for its whole lifetime.
   */
  async presignUpload(
    householdId: string,
    dto: PresignUploadRequest,
  ): Promise<PresignUploadResponse> {
    if (CAPTURE_PURPOSES.has(dto.purpose) && dto.contentLength > MAX_CAPTURE_UPLOAD_BYTES) {
      throw new AppError('VALIDATION_FAILED', 'errors.VALIDATION_FAILED', {
        field: 'contentLength',
        maxBytes: MAX_CAPTURE_UPLOAD_BYTES,
        actualBytes: dto.contentLength,
        purpose: dto.purpose,
      });
    }

    const key = `${householdPrefix(householdId)}${dto.purpose}/${randomUUID()}.${EXTENSION[dto.contentType]}`;

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: dto.contentType,
        ContentLength: dto.contentLength,
      }),
      { expiresIn: EXPIRES_IN_SECONDS },
    );

    return {
      uploadUrl,
      key,
      headers: {
        'Content-Type': dto.contentType,
        'Content-Length': String(dto.contentLength),
      },
      expiresIn: EXPIRES_IN_SECONDS,
    };
  }

  /**
   * Presign a GET for an object the household owns.
   *
   * Vision models are given a URL to fetch, never a bare object key, so this
   * is the only way an uploaded photo reaches the provider.
   */
  async presignDownload(householdId: string, key: string): Promise<string> {
    assertOwnedKey(householdId, key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: EXPIRES_IN_SECONDS },
    );
  }
}
