import type { PresignUploadResponse } from '@kitchen/contracts';

/**
 * Device-side half of a photo upload, kept behind an interface so the
 * orchestration below stays unit-testable without a native runtime. The expo
 * implementation lives in `lib/photo-uploader.ts` — same split as
 * `fonts.ts` / `font-loader.ts`.
 */
export interface PhotoUploader {
  /** Byte size of a local file. `null` when it is missing or unreadable. */
  size(uri: string): Promise<number | null>;
  /** PUTs the file's bytes and resolves with the HTTP status. */
  put(uri: string, url: string, headers: Record<string, string>): Promise<number>;
}

/** A photo could not be read from disk, or the storage PUT was rejected. */
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
 * Uploads each captured photo and returns the object keys to hand to
 * recognition.
 *
 * Presigning alone is not an upload: the key names an object that does not
 * exist until its bytes are PUT to the signed URL. Recognition run against
 * un-uploaded keys sees nothing at all, so a failure here has to stop the flow
 * rather than pass empty keys downstream.
 *
 * The real byte size is sent to the presigner because the API signs
 * `ContentLength` into the URL — a guessed size makes the signature reject the
 * upload.
 */
export async function uploadPhotos(
  photos: string[],
  presign: (contentLength: number) => Promise<PresignUploadResponse>,
  uploader: PhotoUploader,
): Promise<string[]> {
  const keys: string[] = [];

  for (const uri of photos) {
    const size = await uploader.size(uri);
    if (size == null || size <= 0) throw new PhotoUploadError('unreadable', uri);

    const target = await presign(size);
    const status = await uploader.put(uri, target.uploadUrl, target.headers);
    if (status < 200 || status >= 300) {
      throw new PhotoUploadError('rejected', `${status} for ${target.key}`);
    }
    keys.push(target.key);
  }

  return keys;
}
