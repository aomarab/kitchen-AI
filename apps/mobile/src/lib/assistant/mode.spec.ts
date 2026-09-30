import { describe, expect, it } from 'vitest';
import { assistantModeFromParam } from './mode';

describe('assistantModeFromParam', () => {
  it('accepts each known mode', () => {
    expect(assistantModeFromParam('text')).toBe('text');
    expect(assistantModeFromParam('voice')).toBe('voice');
    expect(assistantModeFromParam('live')).toBe('live');
  });

  it('falls back to text chat for a missing or unknown mode', () => {
    expect(assistantModeFromParam(undefined)).toBe('text');
    expect(assistantModeFromParam('')).toBe('text');
    expect(assistantModeFromParam('LIVE')).toBe('text');
    expect(assistantModeFromParam('video')).toBe('text');
  });

  it('reads the first value of a repeated param', () => {
    expect(assistantModeFromParam(['live', 'voice'])).toBe('live');
    expect(assistantModeFromParam([])).toBe('text');
  });
});
