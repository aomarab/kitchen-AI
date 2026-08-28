import type { PresignUploadResponse } from '@kitchen/contracts';

/**
 * Platform-agnostic half of a photo upload. `T` is the photo handle — a file
 * URI on mobile (`string`), a `Blob` on web. The two native operations,
 * `size` and `put`, are injected so this orchestration stays unit-testable
 * without a native or browser runtime.
 */
export interface PhotoUploader<T> {
  /** Byte size of a photo. `null` when it is missing or unreadable. */
  size(photo: T): Promise<number | null>;
  /** PUTs the photo's bytes and resolves with the HTTP status. */
  put(photo: T, url: string, headers: Record<string, string>): Promise<number>;
}

/** A photo could not be read, or the storage PUT was rejected. */
export class PhotoUploadError extends Error {
  constructor(
    readonly reason: 'unreadable' | 'rejected',
    readonly detail: string,
  ) {
    super(`photo upload failed (${reason}): ${detail}`);
    this.name = 'PhotoUploadError';
  }
}

/**
 * Uploads each photo and returns the object keys to hand to recognition.
 *
 * A presigned key names an object that does not exist until its bytes are PUT
 * to the signed URL. Recognition run against un-uploaded keys sees nothing, so
 * a failure here stops the flow rather than passing empty keys downstream. The
 * real byte size is sent to the presigner because the API signs `ContentLength`
 * into the URL — a guessed size makes the signature reject the upload.
 */
export async function uploadPhotos<T>(
  photos: T[],
  presign: (contentLength: number) => Promise<PresignUploadResponse>,
  uploader: PhotoUploader<T>,
): Promise<string[]> {
  const keys: string[] = [];

  for (const photo of photos) {
    const size = await uploader.size(photo);
    if (size == null || size <= 0)
      throw new PhotoUploadError(
        'unreadable',
        typeof photo === 'string' ? photo : JSON.stringify(photo),
      );

    const target = await presign(size);
    const status = await uploader.put(photo, target.uploadUrl, target.headers);
    if (status < 200 || status >= 300) {
      throw new PhotoUploadError('rejected', `${status} for ${target.key}`);
    }
    keys.push(target.key);
  }

  return keys;
}
