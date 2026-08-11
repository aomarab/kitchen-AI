import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

/** The household's credit balance (free grant + purchased). See spec §7. */
export function useCredits() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['credits'],
    queryFn: () => api.call('getCredits'),
    enabled: ready,
  });
}
