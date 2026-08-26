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

const CAPTURE_PURPOSES = new Set<PresignUploadRequest['purpose']>(['inventory_photo', 'receipt']);

const EXTENSION: Record<PresignUploadRequest['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * A provider that fetches an image by URL can only reach storage that is
 * routable from the public internet. A loopback or RFC1918 endpoint — the
 * local MinIO in `infra:up`, or any self-hosted deployment behind NAT — is
 * not, and OpenAI answers with `400 Error while downloading …`. For those
 * endpoints the image is inlined as a data URL instead. Mock providers never
 * dereference the URL, which is why this only ever surfaces against a real
 * provider.
 */
export function isPubliclyRoutable(endpoint: string): boolean {
  let host: string;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) return false;
  if (host === 'host.docker.internal' || host === '0.0.0.0' || host === '::1') return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  return true;
}

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

/**
 * Rejects any key that was not uploaded under a camera-capture purpose.
 *
 * The 2 MB capture ceiling on `presignUpload` keys on the client-declared
 * purpose, so a client can sidestep it by presigning a 15 MB `recipe_image` (or
 * `avatar`) and then handing that key to recognize/receipt — the un-resized
 * frame would reach the vision model. The purpose is a path segment of the key
 * (`households/<id>/<purpose>/<uuid>.<ext>`), so re-derive it and require it to
 * be a capture purpose. Reuses `CAPTURE_PURPOSES` so the two checks cannot
 * drift apart.
 */
export function assertCaptureKey(householdId: string, key: string): void {
  assertOwnedKey(householdId, key);
  const purpose = key.slice(householdPrefix(householdId).length).split('/')[0];
  if (!CAPTURE_PURPOSES.has(purpose as PresignUploadRequest['purpose'])) {
    throw AppError.notFound('errors.NOT_FOUND');
  }
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly storageIsPublic: boolean;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.storageIsPublic = isPubliclyRoutable(env.S3_ENDPOINT);
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
   * The URL a vision provider is given for a capture the household owns.
   *
   * Presigned `https://` when storage is publicly routable, so the provider
   * streams the object itself and the request stays small. Otherwise a
   * `data:` URL with the bytes inlined, because the provider cannot reach a
   * private endpoint. Either way `assertCaptureKey` runs first: `photoKeys`
   * are opaque client strings, so without it a caller could name another
   * household's photo, or an arbitrary URL, and have the model fetch it for
   * them — and a key uploaded under a non-capture purpose (recipe_image,
   * avatar) would otherwise bypass the 2 MB capture ceiling.
   */
  async providerImageUrl(householdId: string, key: string): Promise<string> {
    assertCaptureKey(householdId, key);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });

    if (this.storageIsPublic) {
      return getSignedUrl(this.client, command, { expiresIn: EXPIRES_IN_SECONDS });
    }

    const object = await this.client.send(command);
    if (!object.Body) throw AppError.notFound('errors.NOT_FOUND');
    const bytes = await object.Body.transformToByteArray();
    const contentType = object.ContentType ?? 'image/jpeg';
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
  }

  /**
   * Presign a GET for a capture the household owns, additionally requiring the
   * key to have been uploaded under a camera-capture purpose. Used by the
   * recognize and receipt paths so a key smuggled in under `recipe_image` or
   * `avatar` (which bypasses the 2 MB capture ceiling) cannot reach the vision
   * model.
   */
  async presignCaptureDownload(householdId: string, key: string): Promise<string> {
    assertCaptureKey(householdId, key);
    return this.signGet(key);
  }

  private signGet(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: EXPIRES_IN_SECONDS },
    );
  }
}
