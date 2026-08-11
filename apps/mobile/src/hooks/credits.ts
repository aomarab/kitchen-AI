import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from './keys';

/** The household's credit balance — free grant plus purchased (spec §7). */
export function useCredits() {
  return useQuery({ queryKey: qk.credits, queryFn: () => api.call('getCredits') });
}
