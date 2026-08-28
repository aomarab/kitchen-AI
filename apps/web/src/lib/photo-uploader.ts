import type { PhotoUploader } from '@kitchen/api-client';
import { MOCKING_ENABLED } from './config';

/**
 * The browser half of a photo upload: `size` reads the blob, `put` PUTs its
 * bytes straight to the presigned URL. `File extends Blob`, so the same
 * implementation serves both a canvas capture and a file picked from disk.
 */
export const webPhotoUploader: PhotoUploader<Blob> = {
  async size(blob) {
    return blob.size > 0 ? blob.size : null;
  },

  async put(blob, url, headers) {
    // Under mocks a presigned URL points at nothing, exactly as on mobile.
    // Report success rather than fail the flow the mock exists to exercise.
    if (MOCKING_ENABLED) return 200;
    const response = await fetch(url, { method: 'PUT', body: blob, headers });
    return response.status;
  },
};
