import { describe, expect, it } from 'vitest';
import { appendTranscriptTurn, groupTurns, showStarters } from './transcript';
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

  describe('appendTranscriptTurn', () => {
    it('keeps duplicate ids out of the transcript', () => {
      const turns: TranscriptTurn[] = [{ id: 'a1', role: 'assistant', text: 'Hi' }];

      expect(
        appendTranscriptTurn(
          turns,
          { id: 'a1', role: 'assistant', text: 'Hi again' },
          { isMock: true },
        ),
      ).toBe(turns);
    });

    it('drops a restarted mock greeting once the transcript already has turns', () => {
      const turns: TranscriptTurn[] = [{ id: 'mock-1-greeting', role: 'assistant', text: 'Hi' }];

      expect(
        appendTranscriptTurn(
          turns,
          { id: 'mock-2-greeting', role: 'assistant', text: 'Hi' },
          { isMock: true },
        ),
      ).toBe(turns);
    });

    it('keeps the first greeting and non-mock turns', () => {
      expect(
        appendTranscriptTurn(
          [],
          { id: 'mock-1-greeting', role: 'assistant', text: 'Hi' },
          { isMock: true },
        ),
      ).toEqual([{ id: 'mock-1-greeting', role: 'assistant', text: 'Hi' }]);

      const turns: TranscriptTurn[] = [{ id: 'a1', role: 'assistant', text: 'Hi' }];
      expect(
        appendTranscriptTurn(
          turns,
          { id: 'provider-greeting', role: 'assistant', text: 'Hi again' },
          { isMock: false },
        ),
      ).toHaveLength(2);
    });
  });

  describe('showStarters', () => {
    it('hides while an empty transcript is connecting', () => {
      expect(showStarters([], 'connecting')).toBe(false);
    });

    it('shows after an assistant-only greeting while live', () => {
      expect(showStarters([{ id: 'a1', role: 'assistant', text: 'Hi, I can help.' }], 'live')).toBe(
        true,
      );
    });

    it('hides after any user turn exists', () => {
      expect(
        showStarters(
          [
            { id: 'a1', role: 'assistant', text: 'Hi, I can help.' },
            { id: 'u1', role: 'user', text: 'What can I cook?' },
          ],
          'live',
        ),
      ).toBe(false);
    });

    it('hides after an ended assistant-only session', () => {
      expect(showStarters([{ id: 'a1', role: 'assistant', text: 'Hi.' }], 'ended')).toBe(false);
    });
  });

  it('does not mutate the transcript objects passed in', () => {
    const turn: TranscriptTurn = { id: 'a1', role: 'assistant', text: 'Hi' };

    groupTurns([turn]);

    expect('firstInRun' in turn).toBe(false);
  });
});
