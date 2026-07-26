import { QueryClient } from '@tanstack/react-query';

/**
 * Shared client so background helpers (offline sync) can invalidate the same
 * cache the React tree uses. Retries are conservative because the API client
 * already refreshes tokens and surfaces typed errors.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const name = (error as { name?: string })?.name;
        if (name === 'ContractViolationError' || name === 'ApiError') return false;
        return failureCount < 2;
      },
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});
