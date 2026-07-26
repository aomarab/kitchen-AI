import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignUploadRequest, PresignUploadResponse } from '@kitchen/contracts';
import { ENV, type Env } from '../config/env.js';

const EXPIRES_IN_SECONDS = 300;

const EXTENSION: Record<PresignUploadRequest['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

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
   */
  async presignUpload(
    householdId: string,
    dto: PresignUploadRequest,
  ): Promise<PresignUploadResponse> {
    const key = `households/${householdId}/${dto.purpose}/${randomUUID()}.${EXTENSION[dto.contentType]}`;

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: dto.contentType,
      }),
      { expiresIn: EXPIRES_IN_SECONDS },
    );

    return {
      uploadUrl,
      key,
      headers: { 'Content-Type': dto.contentType },
      expiresIn: EXPIRES_IN_SECONDS,
    };
  }
}
