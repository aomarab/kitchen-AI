import { describe, expect, it, vi } from 'vitest';
import { PhotoUploadError, uploadPhotos, type PhotoUploader } from './upload';

function presigner(sizes: number[] = []) {
  return vi.fn(async (contentLength: number) => {
    sizes.push(contentLength);
    return {
      uploadUrl: `https://s3.test/put/${sizes.length}`,
      key: `households/hh/inventory_photo/${sizes.length}.jpg`,
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(contentLength) },
      expiresIn: 300,
    };
  });
}

function uploader(overrides: Partial<PhotoUploader> = {}): PhotoUploader {
  return {
    size: async () => 1234,
    put: async () => 200,
    ...overrides,
  };
}

/**
 * A presigned key names an object that does not exist until its bytes are PUT.
 * Recognition against un-uploaded keys "succeeds" against nothing, so these
 * cover the step that was missing entirely: the upload itself.
 */
describe('uploadPhotos', () => {
  it('PUTs every photo before returning its key', async () => {
    const put = vi.fn<PhotoUploader['put']>(async () => 200);

    const keys = await uploadPhotos(['file://a.jpg', 'file://b.jpg'], presigner(), uploader({ put }));

    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls.map((c) => c[0])).toEqual(['file://a.jpg', 'file://b.jpg']);
    expect(keys).toHaveLength(2);
  });

  it('sends the real byte size to the presigner', async () => {
    const sizes: number[] = [];

    await uploadPhotos(['file://a.jpg'], presigner(sizes), uploader({ size: async () => 812_345 }));

    // The API signs ContentLength into the URL, so a guessed size would make
    // S3 reject the upload.
    expect(sizes).toEqual([812_345]);
  });

  it('forwards the presigned headers with the PUT', async () => {
    const put = vi.fn<PhotoUploader['put']>(async () => 200);

    await uploadPhotos(['file://a.jpg'], presigner(), uploader({ put }));

    expect(put.mock.calls[0]?.[2]).toMatchObject({ 'Content-Type': 'image/jpeg' });
  });

  it('throws rather than returning a key when storage rejects the PUT', async () => {
    await expect(
      uploadPhotos(['file://a.jpg'], presigner(), uploader({ put: async () => 403 })),
    ).rejects.toBeInstanceOf(PhotoUploadError);
  });

  it('throws rather than presigning when the photo cannot be read', async () => {
    const presign = presigner();

    await expect(
      uploadPhotos(['file://gone.jpg'], presign, uploader({ size: async () => null })),
    ).rejects.toMatchObject({ reason: 'unreadable' });
    expect(presign).not.toHaveBeenCalled();
  });

  it('never invents a placeholder key for an empty selection', async () => {
    await expect(uploadPhotos([], presigner(), uploader())).resolves.toEqual([]);
  });
});
