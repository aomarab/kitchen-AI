import type { AssistantStatus } from './realtime-port';
import type { OrbState } from '../orb';

export type AssistantOrbMode = 'text' | 'voice' | 'live';

export interface OrbStateInput {
  status: AssistantStatus;
  mode: AssistantOrbMode;
  speaking: boolean;
}

export function orbStateFor({ status, mode, speaking }: OrbStateInput): OrbState {
  if (speaking) return 'speaking';
  if (status === 'live' && mode === 'voice') return 'listening';
  return 'idle';
}
