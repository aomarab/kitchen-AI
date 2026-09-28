import type { TranscriptTurn } from './realtime-port';
import type { AssistantStatus } from './realtime-port';

export type GroupedTranscriptTurn = TranscriptTurn & {
  firstInRun: boolean;
};

export function groupTurns(turns: readonly TranscriptTurn[]): GroupedTranscriptTurn[] {
  return turns.map((turn, index) => ({
    ...turn,
    firstInRun: turn.role === 'assistant' && turns[index - 1]?.role !== 'assistant',
  }));
}

export function showStarters(turns: readonly TranscriptTurn[], status: AssistantStatus): boolean {
  return status !== 'connecting' && !turns.some((turn) => turn.role === 'user');
}
