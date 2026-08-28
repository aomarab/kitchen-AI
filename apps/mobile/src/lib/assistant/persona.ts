import {
  DEFAULT_ASSISTANT_PERSONA,
  assistantPersonaSchema,
  type AssistantPersona,
} from '@kitchen/contracts';

/**
 * The stored persona id arrives from the server profile, so at runtime it is a
 * plain string that crossed the network — a catalog that shrank under a user's
 * feet leaves a stale id behind. Client-side we mirror the server's fallback
 * rule (voice & personalization spec §5): a stored id that is no longer in the
 * catalog degrades to the default rather than highlighting nothing. The
 * contract enum is the single source of the valid set, so a persona added to it
 * is honoured here without a second list to keep in step.
 */
export function resolvePersonaSelection(stored: string | null | undefined): AssistantPersona {
  const parsed = assistantPersonaSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_ASSISTANT_PERSONA;
}
