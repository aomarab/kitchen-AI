import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Job } from '@kitchen/contracts';
import { api } from '../lib/api';
import { qk } from './keys';

const TERMINAL: ReadonlySet<Job['status']> = new Set<Job['status']>(['done', 'failed']);

export function isTerminal(job: Job | undefined): boolean {
  return !!job && TERMINAL.has(job.status);
}

/**
 * Polls a long-running job until it reaches a terminal state. Polling stops
 * automatically once the job is done or failed, keeping the UI responsive
 * during plan generation and receipt parsing (spec §3.3).
 */
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: qk.job(jobId ?? 'none'),
    queryFn: () => api.call('getJob', { params: { id: jobId! } }),
    enabled: !!jobId,
    refetchInterval: (query) => (isTerminal(query.state.data) ? false : 1200),
  });
}

export function useInvalidateJob() {
  const qc = useQueryClient();
  return (jobId: string) => qc.invalidateQueries({ queryKey: qk.job(jobId) });
}
