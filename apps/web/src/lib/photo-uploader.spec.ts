import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('webPhotoUploader', () => {
  it('PUTs the blob with its headers and returns the status', async () => {
    vi.doMock('./config', () => ({ MOCKING_ENABLED: false }));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { webPhotoUploader } = await import('./photo-uploader');

    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const status = await webPhotoUploader.put(blob, 'https://s3.test/put', { 'x-h': '1' });

    expect(status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://s3.test/put');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'x-h': '1' } });
    expect(init!.body).toBe(blob);
    vi.doUnmock('./config');
  });

  it('short-circuits to 200 under mocks without fetching', async () => {
    vi.doMock('./config', () => ({ MOCKING_ENABLED: true }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { webPhotoUploader } = await import('./photo-uploader');

    const status = await webPhotoUploader.put(new Blob(['x']), 'https://s3.test/put', {});

    expect(status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.doUnmock('./config');
  });

  it('reports null for an empty blob', async () => {
    const { webPhotoUploader } = await import('./photo-uploader');
    expect(await webPhotoUploader.size(new Blob([]))).toBeNull();
    expect(await webPhotoUploader.size(new Blob(['abc']))).toBe(3);
  });
});
