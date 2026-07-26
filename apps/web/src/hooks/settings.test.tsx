import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const call = vi.hoisted(() => vi.fn());

vi.mock('../lib/api', () => ({ api: { call } }));
vi.mock('../mocks/provider', () => ({ useMocksReady: () => true }));

import { useUpdateProfile } from './settings';

type Cuisine = 'levantine' | 'gulf';

interface CachedProfile {
  cuisinePrefs: Cuisine[];
}

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  qc.setQueryData(['profile'], { cuisinePrefs: [] } satisfies CachedProfile);
  return qc;
}

function cached(qc: QueryClient): CachedProfile {
  return qc.getQueryData(['profile']) as CachedProfile;
}

interface Deferred {
  promise: Promise<CachedProfile>;
  resolve: (value: CachedProfile) => void;
  reject: (error: Error) => void;
}

/**
 * The requests are settled by hand. Timer-based mocks cannot express "both are
 * in flight at once": `waitFor` polls on a 50 ms interval and only re-checks on
 * a DOM mutation, and `renderHook` renders nothing, so a 20 ms request has
 * always finished by the time the first assertion passes — the overlap the test
 * claims to exercise never happens.
 */
function deferred(): Deferred {
  let resolve!: (value: CachedProfile) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CachedProfile>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (mutation callbacks) run to completion. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Each Settings toggle sends the *whole* preference array, rebuilt from the
 * cached profile. Two toggles pressed in quick succession therefore both read
 * the pre-first-toggle cache unless the first writes its result there
 * immediately — and the second request silently undoes the first.
 */
describe('useUpdateProfile', () => {
  it('does not let a second rapid toggle undo the first', async () => {
    const qc = newClient();
    const first = deferred();
    const second = deferred();
    const pending = [first, second];
    call.mockImplementation(() => pending.shift()!.promise);

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(qc) });

    act(() => result.current.mutate({ cuisinePrefs: ['levantine'] }));
    await flush();
    // Applied to the cache straight away, before the request resolves.
    expect(cached(qc).cuisinePrefs).toEqual(['levantine']);

    // Second toggle, built from the cache while the first is genuinely in flight.
    act(() => result.current.mutate({ cuisinePrefs: [...cached(qc).cuisinePrefs, 'gulf'] }));
    await flush();
    expect(cached(qc).cuisinePrefs).toEqual(['levantine', 'gulf']);

    const lastCall = call.mock.calls.at(-1) as [string, { body: CachedProfile }];
    expect(lastCall[1].body.cuisinePrefs).toEqual(['levantine', 'gulf']);

    // The first response lands last, carrying the pre-second-toggle value.
    second.resolve({ cuisinePrefs: ['levantine', 'gulf'] });
    await flush();
    first.resolve({ cuisinePrefs: ['levantine'] });
    await flush();

    expect(cached(qc).cuisinePrefs).toEqual(['levantine', 'gulf']);
  });

  it('rolls the cache back when the request fails', async () => {
    const qc = newClient();
    call.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ cuisinePrefs: ['levantine'] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached(qc).cuisinePrefs).toEqual([]);
  });

  it('does not roll a failed toggle back over a newer one', async () => {
    const qc = newClient();
    const failing = deferred();
    const succeeding = deferred();
    const pending = [failing, succeeding];
    call.mockImplementation(() => pending.shift()!.promise);

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(qc) });

    act(() => result.current.mutate({ cuisinePrefs: ['levantine'] }));
    await flush();
    act(() => result.current.mutate({ cuisinePrefs: [...cached(qc).cuisinePrefs, 'gulf'] }));
    await flush();

    // The earlier request fails while the later one is still in flight. Its
    // snapshot predates the later toggle, so restoring it would erase a change
    // the user made afterwards — and which is about to be accepted.
    failing.reject(new Error('nope'));
    await flush();

    expect(cached(qc).cuisinePrefs).toEqual(['levantine', 'gulf']);

    succeeding.resolve({ cuisinePrefs: ['levantine', 'gulf'] });
    await flush();
    expect(cached(qc).cuisinePrefs).toEqual(['levantine', 'gulf']);
  });

  it('refetches once both toggles settle in the same turn', async () => {
    const qc = newClient();
    const a = deferred();
    const b = deferred();
    const pending = [a, b];
    call.mockImplementation(() => pending.shift()!.promise);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(qc) });

    act(() => result.current.mutate({ cuisinePrefs: ['levantine'] }));
    await flush();
    act(() => result.current.mutate({ cuisinePrefs: ['levantine', 'gulf'] }));
    await flush();

    // Both land in the same event-loop turn. A pending-count check sees 2 on
    // both callbacks and reconciles neither.
    a.resolve({ cuisinePrefs: ['levantine'] });
    b.resolve({ cuisinePrefs: ['levantine', 'gulf'] });
    await flush();

    const profileInvalidations = invalidate.mock.calls.filter(
      ([arg]) => JSON.stringify((arg as { queryKey?: unknown })?.queryKey) === '["profile"]',
    );
    expect(profileInvalidations.length).toBe(1);
  });
});
