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

export function appendTranscriptTurn(
  turns: TranscriptTurn[],
  turn: TranscriptTurn,
  options: { isMock: boolean },
): TranscriptTurn[] {
  if (turns.some((existing) => existing.id === turn.id)) return turns;
  if (options.isMock && turns.length > 0 && turn.id.endsWith('-greeting')) return turns;
  return [...turns, turn];
}

export function showStarters(turns: readonly TranscriptTurn[], status: AssistantStatus): boolean {
  return status === 'live' && !turns.some((turn) => turn.role === 'user');
}
