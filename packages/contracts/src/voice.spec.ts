import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_PERSONAS,
  DEFAULT_ASSISTANT_PERSONA,
  assistantPersonaSchema,
  assistantVoiceSchema,
  resolveAssistantPersona,
} from './voice.js';
import { profileSchema } from './household.js';

describe('assistant persona contracts', () => {
  /*
   * Two checks that used to live here have been deleted rather than kept:
   * "describes every persona" and "maps every persona to a provider voice".
   *
   * `ASSISTANT_PERSONAS` is typed `Record<AssistantPersona, AssistantPersonaProfile>`,
   * so a missing persona, an extra one, and a voice outside
   * `assistantVoiceSchema` are all **compile errors**. Fault injection proved
   * it: the defect never reached the assertion because the package stopped
   * building. A check that cannot be made to fail is decoration, and keeping it
   * would have made the suite look stronger than it is. The type is the
   * enforcement; `scripts/fault-inject-assistant.mjs` records the finding.
   */

  it('gives every persona a distinct voice', () => {
    const voices = Object.values(ASSISTANT_PERSONAS).map((p) => p.voice);
    expect(new Set(voices).size).toBe(voices.length);
  });

  it('offers a distinct dialect per persona', () => {
    const dialects = Object.values(ASSISTANT_PERSONAS).map((p) => p.dialect);
    expect(new Set(dialects).size).toBe(dialects.length);
  });

  it('lists exactly the ten voices the provider accepts', () => {
    // Verified live: this is the provider's own enumeration, from its rejection
    // message. Changing it means re-checking against the API, not editing here.
    expect([...assistantVoiceSchema.options]).toEqual([
      'alloy',
      'ash',
      'ballad',
      'cedar',
      'coral',
      'echo',
      'marin',
      'sage',
      'shimmer',
      'verse',
    ]);
  });

  it('defaults to a persona that is in the catalog', () => {
    expect(assistantPersonaSchema.options).toContain(DEFAULT_ASSISTANT_PERSONA);
  });

  it('falls back rather than throwing on an unknown stored persona', () => {
    expect(resolveAssistantPersona('layla')).toBe('layla');
    expect(resolveAssistantPersona('a-persona-we-deleted')).toBe(DEFAULT_ASSISTANT_PERSONA);
    expect(resolveAssistantPersona(null)).toBe(DEFAULT_ASSISTANT_PERSONA);
    expect(resolveAssistantPersona(undefined)).toBe(DEFAULT_ASSISTANT_PERSONA);
  });

  it('gives a profile with no stored persona the default', () => {
    const profile = profileSchema.parse({ userId: '00000000-0000-4000-8000-000000000000' });
    expect(profile.assistantPersona).toBe(DEFAULT_ASSISTANT_PERSONA);
  });
});
