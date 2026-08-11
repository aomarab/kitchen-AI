import { describe, expect, it, vi } from 'vitest';
import { createApiClient, NetworkError, TimeoutError } from './index.js';

const body = { email: 'a@b.com', password: 'pw' } as const;

const ok = () =>
  new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Resolves only once the caller's signal aborts, like a request left hanging. */
const hang: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    signal.addEventListener('abort', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });

describe('request timeouts', () => {
  it('reports a slow request as a timeout, not a network failure', async () => {
    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: hang, timeoutMs: 20 });

    const error = await client.call('login', { body }).catch((e) => e);

    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).timeoutMs).toBe(20);
  });

  it('keeps timeouts assignable to NetworkError so retry/queue handling still applies', async () => {
    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: hang, timeoutMs: 20 });

    await expect(client.call('login', { body })).rejects.toBeInstanceOf(NetworkError);
  });

  it('lets a single call buy more time than the client default', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(hang);
      const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl, timeoutMs: 50 });
      const pending = client.call('login', { body, timeoutMs: 5_000 }).catch((e) => e);

      // Past the client-wide budget: the per-call override must still be waiting.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(4_500);
      expect(await pending).toBeInstanceOf(TimeoutError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not disguise a caller cancellation as a timeout', async () => {
    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: hang });
    const controller = new AbortController();
    const pending = client.call('login', { body, signal: controller.signal }).catch((e) => e);
    controller.abort();

    const error = await pending;
    expect(error).not.toBeInstanceOf(TimeoutError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('still reports a genuine transport failure as a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl });

    const error = await client.call('login', { body }).catch((e) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error).not.toBeInstanceOf(TimeoutError);
  });

  it('leaves a fast request untouched', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl,
      validateResponses: false,
    });

    await expect(client.call('login', { body })).resolves.toBeTruthy();
  });
});
