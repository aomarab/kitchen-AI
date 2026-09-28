import type { TranscriptTurn } from './realtime-port';

export type GroupedTranscriptTurn = TranscriptTurn & {
  firstInRun: boolean;
};

export function groupTurns(turns: readonly TranscriptTurn[]): GroupedTranscriptTurn[] {
  return turns.map((turn, index) => ({
    ...turn,
    firstInRun: turn.role === 'assistant' && turns[index - 1]?.role !== 'assistant',
  }));
}
