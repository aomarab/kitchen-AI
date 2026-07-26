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

/**
 * Each Settings toggle sends the *whole* preference array, rebuilt from the
 * cached profile. Two toggles pressed in quick succession therefore both read
 * the pre-first-toggle cache unless the first writes its result there
 * immediately — and the second request silently undoes the first.
 */
describe('useUpdateProfile', () => {
  it('does not let a second rapid toggle undo the first', async () => {
    const qc = newClient();
    call.mockImplementation(
      (_route: string, options: { body: CachedProfile }) =>
        new Promise((resolve) => setTimeout(() => resolve({ ...options.body }), 20)),
    );

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(qc) });

    act(() => result.current.mutate({ cuisinePrefs: ['levantine'] }));
    // Applied to the cache straight away, before the request resolves.
    await waitFor(() => expect(cached(qc).cuisinePrefs).toEqual(['levantine']));

    // Second toggle, built from the cache while the first is still in flight.
    act(() => result.current.mutate({ cuisinePrefs: [...cached(qc).cuisinePrefs, 'gulf'] }));
    await waitFor(() => expect(cached(qc).cuisinePrefs).toEqual(['levantine', 'gulf']));

    const lastCall = call.mock.calls.at(-1) as [string, { body: CachedProfile }];
    expect(lastCall[1].body.cuisinePrefs).toEqual(['levantine', 'gulf']);
  });

  it('rolls the cache back when the request fails', async () => {
    const qc = newClient();
    call.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ cuisinePrefs: ['levantine'] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached(qc).cuisinePrefs).toEqual([]);
  });
});
