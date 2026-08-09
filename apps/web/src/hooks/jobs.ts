import { useQuery } from '@tanstack/react-query';
import type { Job } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

/**
 * Polls a long-running job until it settles. Generation stays usable meanwhile
 * because this is just another background query (spec §3.3, §5.4).
 */
export function useJob(id: string | null, onDone?: (job: Job) => void) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['job', id],
    queryFn: async () => {
      const job = await api.call('getJob', { params: { id: id! } });
      if ((job.status === 'done' || job.status === 'failed') && onDone) onDone(job);
      return job;
    },
    enabled: ready && Boolean(id),
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job || job.status === 'done' || job.status === 'failed') return false;
      return 700;
    },
  });
}
