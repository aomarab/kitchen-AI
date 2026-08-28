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

function uploader(overrides: Partial<PhotoUploader<string>> = {}): PhotoUploader<string> {
  return { size: async () => 1234, put: async () => 200, ...overrides };
}

describe('uploadPhotos', () => {
  it('PUTs every photo before returning its key', async () => {
    const put = vi.fn<PhotoUploader<string>['put']>(async () => 200);
    const keys = await uploadPhotos(['a.jpg', 'b.jpg'], presigner(), uploader({ put }));
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls.map((c) => c[0])).toEqual(['a.jpg', 'b.jpg']);
    expect(keys).toEqual([
      'households/hh/inventory_photo/1.jpg',
      'households/hh/inventory_photo/2.jpg',
    ]);
  });

  it('sends the real byte size to the presigner', async () => {
    const sizes: number[] = [];
    await uploadPhotos(['a.jpg'], presigner(sizes), uploader({ size: async () => 4096 }));
    expect(sizes).toEqual([4096]);
  });

  it('throws unreadable when a photo has no size', async () => {
    await expect(
      uploadPhotos(['a.jpg'], presigner(), uploader({ size: async () => null })),
    ).rejects.toMatchObject({ reason: 'unreadable' });
  });

  it('stops and throws rejected when a PUT fails', async () => {
    const put = vi.fn<PhotoUploader<string>['put']>(async () => 403);
    await expect(
      uploadPhotos(['a.jpg', 'b.jpg'], presigner(), uploader({ put })),
    ).rejects.toBeInstanceOf(PhotoUploadError);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('generalises beyond string photos', async () => {
    const put = vi.fn(async () => 200);
    const keys = await uploadPhotos<{ id: number }>([{ id: 7 }], presigner(), {
      size: async () => 10,
      put,
    });
    expect(put.mock.calls[0]![0]).toEqual({ id: 7 });
    expect(keys).toHaveLength(1);
  });
});
