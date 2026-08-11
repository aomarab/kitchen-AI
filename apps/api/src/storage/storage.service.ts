import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignUploadRequest, PresignUploadResponse } from '@kitchen/contracts';
import { AppError } from '../common/errors.js';
import { ENV, type Env } from '../config/env.js';

const EXPIRES_IN_SECONDS = 300;

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
   * The URL a vision provider is given for an object the household owns.
   *
   * Presigned `https://` when storage is publicly routable, so the provider
   * streams the object itself and the request stays small. Otherwise a
   * `data:` URL with the bytes inlined, because the provider cannot reach a
   * private endpoint. Either way the key is checked against the household
   * prefix first: `photoKeys` are opaque client strings, and without that
   * check a caller could name another household's photo, or an arbitrary URL,
   * and have the model fetch it for them.
   */
  async providerImageUrl(householdId: string, key: string): Promise<string> {
    assertOwnedKey(householdId, key);
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
}
