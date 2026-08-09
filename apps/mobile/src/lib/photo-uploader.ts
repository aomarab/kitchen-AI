import { File, UploadType } from 'expo-file-system';
import { usingMocks } from './api';
import type { PhotoUploader } from './upload';

/**
 * Uploads photo bytes straight to object storage with the presigned PUT.
 *
 * The native half of `lib/upload.ts`; kept apart so the orchestration there is
 * unit-testable in a node environment.
 */
export const expoPhotoUploader: PhotoUploader = {
  async size(uri) {
    const file = new File(uri);
    if (!file.exists) return null;
    return file.size > 0 ? file.size : null;
  },

  async put(uri, url, headers) {
    // MSW patches `fetch`; expo-file-system uploads through the native stack,
    // so a mocked presign URL has nothing listening behind it. Report success
    // rather than fail the capture flow the mock exists to exercise.
    if (usingMocks) return 200;

    const result = await new File(uri).upload(url, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers,
    });
    return result.status;
  },
};
