import { describe, expect, it } from 'vitest';
import { groupTurns } from './transcript';
import type { TranscriptTurn } from './realtime-port';

describe('groupTurns', () => {
  it('marks the first assistant bubble in each consecutive assistant run', () => {
    const turns: TranscriptTurn[] = [
      { id: 'u1', role: 'user', text: 'What can I cook?' },
      { id: 'a1', role: 'assistant', text: 'Start with tomatoes.' },
      { id: 'a2', role: 'assistant', text: 'Add eggs.' },
      { id: 'u2', role: 'user', text: 'Anything quick?' },
      { id: 'a3', role: 'assistant', text: 'Make shakshuka.' },
    ];

    expect(groupTurns(turns).map((turn) => [turn.id, turn.firstInRun])).toEqual([
      ['u1', false],
      ['a1', true],
      ['a2', false],
      ['u2', false],
      ['a3', true],
    ]);
  });

  it('does not mutate the transcript objects passed in', () => {
    const turn: TranscriptTurn = { id: 'a1', role: 'assistant', text: 'Hi' };

    groupTurns([turn]);

    expect('firstInRun' in turn).toBe(false);
  });
});
