import { describe, expect, it } from 'vitest';
import { isPubliclyRoutable, StorageService } from './storage.service.js';
import type { Env } from '../config/env.js';

/**
 * A vision provider dereferences the URL it is given. A presigned URL that
 * points at loopback or RFC1918 is unreachable from OpenAI's network, which
 * fails the whole scan with `400 Error while downloading`. Mock providers never
 * dereference, so only a real provider exposes it — these tests stand in for
 * that coverage.
 */
describe('isPubliclyRoutable', () => {
  it('rejects loopback and local hostnames', () => {
    for (const endpoint of [
      'http://localhost:9010',
      'http://127.0.0.1:9010',
      'http://0.0.0.0:9010',
      'http://mac.local:9010',
      'http://host.docker.internal:9010',
    ]) {
      expect(isPubliclyRoutable(endpoint), endpoint).toBe(false);
    }
  });

  it('rejects every private IPv4 range', () => {
    for (const endpoint of [
      'http://10.0.0.5:9010',
      'http://192.168.100.99:9010',
      'http://172.16.0.1:9010',
      'http://172.31.255.254:9010',
      'http://169.254.1.1:9010',
    ]) {
      expect(isPubliclyRoutable(endpoint), endpoint).toBe(false);
    }
  });

  it('accepts public endpoints, including the 172 addresses outside the private block', () => {
    for (const endpoint of [
      'https://s3.us-east-1.amazonaws.com',
      'https://kitchen-photos.s3.amazonaws.com',
      'http://172.32.0.1:9010',
      'http://172.15.0.1:9010',
    ]) {
      expect(isPubliclyRoutable(endpoint), endpoint).toBe(true);
    }
  });

  it('treats an unparseable endpoint as not routable rather than throwing', () => {
    expect(isPubliclyRoutable('not-a-url')).toBe(false);
  });
});

function buildService(
  endpoint: string,
  body: Uint8Array,
  contentType?: string,
  stubClient = true,
): StorageService {
  const env = {
    S3_BUCKET: 'kitchen-photos',
    S3_ENDPOINT: endpoint,
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY: 'a',
    S3_SECRET_KEY: 'b',
  } as unknown as Env;
  const service = new StorageService(env);
  // Stand in for S3 so the test never touches the network. The public path
  // signs offline against the real client, so it keeps the genuine one.
  if (stubClient) {
    (service as unknown as { client: { send: (c: unknown) => Promise<unknown> } }).client = {
      send: async () => ({
        Body: { transformToByteArray: async () => body },
        ContentType: contentType,
      }),
    };
  }
  return service;
}

describe('StorageService.providerImageUrl', () => {
  const household = '11111111-1111-4111-8111-111111111111';
  const key = `households/${household}/inventory_photo/a.jpg`;
  const bytes = new Uint8Array([1, 2, 3, 4]);

  it('inlines the image when storage is private', async () => {
    const url = await buildService(
      'http://192.168.100.99:9010',
      bytes,
      'image/png',
    ).providerImageUrl(household, key);
    expect(url).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
  });

  it('falls back to jpeg when the object has no content type', async () => {
    const url = await buildService('http://localhost:9010', bytes).providerImageUrl(household, key);
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('presigns rather than inlining when storage is public', async () => {
    const url = await buildService(
      'https://s3.us-east-1.amazonaws.com',
      bytes,
      undefined,
      false,
    ).providerImageUrl(household, key);
    expect(url.startsWith('data:')).toBe(false);
    expect(url).toContain('X-Amz-Signature');
  });

  it("refuses a key outside the household's prefix in both modes", async () => {
    const foreign = 'households/22222222-2222-4222-8222-222222222222/inventory_photo/a.jpg';
    await expect(
      buildService('http://localhost:9010', bytes).providerImageUrl(household, foreign),
    ).rejects.toThrow();
    await expect(
      buildService('https://s3.us-east-1.amazonaws.com', bytes, undefined, false).providerImageUrl(
        household,
        foreign,
      ),
    ).rejects.toThrow();
  });
});
