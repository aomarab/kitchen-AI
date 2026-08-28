import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Assistant personas                                                  */
/* (voice & personalization spec — 2026-08-28)                         */
/* ------------------------------------------------------------------ */

/**
 * The voice ids the realtime provider accepts.
 *
 * This list is contract rather than server detail for the same reason
 * {@link CREDIT_COSTS} is: the provider **validates it**. An unrecognised voice
 * is a hard 400 at mint — that is, a failure on the paid path, after the
 * household has been charged — so an unchecked value here is a billing bug, not
 * a cosmetic one.
 *
 * These ten are the provider's own enumeration, taken from its rejection
 * message rather than from documentation, so the list cannot drift from what
 * the API will actually accept without the API telling us.
 */
export const assistantVoiceSchema = z.enum([
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
export type AssistantVoice = z.infer<typeof assistantVoiceSchema>;

/**
 * Arabic dialects the assistant can be steered toward.
 *
 * `msa` (Modern Standard Arabic) is included as the neutral option: it is what
 * a pan-Arab speaker reads, and the right answer for a user whose dialect we do
 * not offer. It is not a dialect in the same sense as the other three, which is
 * why it is named for what it is rather than being called "standard".
 *
 * Steering is by instruction, and it demonstrably changes both lexis and
 * culinary reference. It does **not** change accent — see the spec's known
 * limitations.
 */
export const assistantDialectSchema = z.enum(['levantine', 'gulf', 'egyptian', 'msa']);
export type AssistantDialect = z.infer<typeof assistantDialectSchema>;

/** How the assistant carries itself. Applies in both languages. */
export const assistantToneSchema = z.enum(['warm', 'neutral', 'energetic']);
export type AssistantTone = z.infer<typeof assistantToneSchema>;

/**
 * The personas a user can choose between.
 *
 * Named rather than presented as three independent dropdowns: "voice + dialect
 * + tone" is a combinatorial space most of which sounds wrong, and a user has
 * no way to audition it. A curated set of four is a product decision we can
 * actually test.
 */
export const assistantPersonaSchema = z.enum(['layla', 'noor', 'salma', 'omar']);
export type AssistantPersona = z.infer<typeof assistantPersonaSchema>;

export interface AssistantPersonaProfile {
  readonly voice: AssistantVoice;
  /** Applied only when the session locale is `ar`. */
  readonly dialect: AssistantDialect;
  readonly tone: AssistantTone;
}

/**
 * What each persona actually is.
 *
 * The `Record<AssistantPersona, …>` type is load-bearing: adding a persona to
 * the enum without describing it here is a **compile error**, so the catalog
 * cannot fall behind the set of choices we offer.
 *
 * Display names live in `@kitchen/i18n`, not here — `ar.ts` is typed against
 * `en.ts`, so a persona shipped without an Arabic name is a build error. This
 * file holds behaviour; that one holds words.
 */
export const ASSISTANT_PERSONAS: Record<AssistantPersona, AssistantPersonaProfile> = {
  layla: { voice: 'coral', dialect: 'levantine', tone: 'warm' },
  noor: { voice: 'sage', dialect: 'gulf', tone: 'neutral' },
  salma: { voice: 'shimmer', dialect: 'egyptian', tone: 'energetic' },
  omar: { voice: 'ash', dialect: 'msa', tone: 'neutral' },
};

/**
 * The persona a user gets before they choose one, and the fallback when a
 * stored id is no longer in the catalog.
 */
export const DEFAULT_ASSISTANT_PERSONA: AssistantPersona = 'layla';

/**
 * Coerce a stored value into a persona, falling back rather than throwing.
 *
 * This is the shape it is because of *where* it is called: between the credit
 * spend and the mint. A stored id that is no longer in the catalog means we
 * shrank the catalog under a user's feet, and refusing a session the household
 * has already paid for — over a cosmetic preference they did not even ask about
 * this time — is far worse than giving them the default voice.
 */
export function resolveAssistantPersona(value: string | null | undefined): AssistantPersona {
  const parsed = assistantPersonaSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_ASSISTANT_PERSONA;
}
