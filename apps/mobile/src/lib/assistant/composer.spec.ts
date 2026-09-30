import { describe, expect, it } from 'vitest';
import { composerAction } from './composer';

describe('composerAction', () => {
  it('sends whenever the draft has non-whitespace text', () => {
    expect(composerAction({ mode: 'text', draft: ' hello ', micMuted: false })).toBe('send');
    expect(composerAction({ mode: 'voice', draft: 'hello', micMuted: true })).toBe('send');
  });

  it('toggles the mic for an empty voice composer', () => {
    expect(composerAction({ mode: 'voice', draft: '', micMuted: false })).toBe('mic');
    expect(composerAction({ mode: 'voice', draft: '   ', micMuted: true })).toBe('micMuted');
  });

  it('disables send for empty non-voice composers', () => {
    expect(composerAction({ mode: 'text', draft: '', micMuted: false })).toBe('sendDisabled');
    expect(composerAction({ mode: 'live', draft: '', micMuted: false })).toBe('sendDisabled');
  });
});
