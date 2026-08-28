import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANT_PERSONA, assistantPersonaSchema } from '@kitchen/contracts';
import { resolvePersonaSelection } from './persona';

describe('resolvePersonaSelection', () => {
  it('keeps a persona that is still in the catalog', () => {
    for (const persona of assistantPersonaSchema.options) {
      expect(resolvePersonaSelection(persona)).toBe(persona);
    }
  });

  it('falls back to the default when the stored persona has left the catalog', () => {
    expect(resolvePersonaSelection('a-persona-we-retired')).toBe(DEFAULT_ASSISTANT_PERSONA);
  });

  it('falls back to the default when nothing is stored', () => {
    expect(resolvePersonaSelection(undefined)).toBe(DEFAULT_ASSISTANT_PERSONA);
    expect(resolvePersonaSelection(null)).toBe(DEFAULT_ASSISTANT_PERSONA);
  });
});
