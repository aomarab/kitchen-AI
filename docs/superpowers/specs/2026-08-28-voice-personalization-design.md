# Voice & personalization — design

**Date:** 2026-08-28
**Status:** design approved, implementation in progress
**Supersedes:** the Feature 4 sketch in `2026-08-26-kitchen-companion-design.md` (§"Feature 4 —
Voice & personalization"), which was written before Feature 5 was built and no longer describes a
system that exists.

## Why this spec deviates from the original sketch

The companion spec sketched Feature 4 as four settings (`assistantVoice`, `voiceDialect`, `tone`,
`recipeLanguage`) plus per-type alert opt-ins, all delivered through a `TTS_PORT` with a preview
route. Building it as written would have produced three kinds of waste, each discovered by reading
the code rather than by re-reading the sketch:

1. **The alert opt-ins already exist.** `reminder_settings` has `breakEnabled`, `stretchEnabled`,
   `morningEnabled` and `hydrationEnabled`, household-scoped, shipped with Feature 2. Re-specifying
   them would have meant either duplicating a working surface or migrating it for no user-visible
   gain.

2. **`TTS_PORT` does not exist, and nothing in the app speaks.** There is no `expo-av`,
   `expo-audio` or `expo-speech` anywhere in the tree; reminders and timers alert through
   `expo-notifications` and the system sound. The **only** audio path in Kitchen AI is the live
   assistant, and that audio is synthesised by the realtime provider inside the session — it never
   passes through us. A `TTS_PORT` would therefore be an engine built for one consumer that does
   not want it. We are not building it.

3. **`recipeLanguage` is already the locale.** AI prompts already carry the active locale so
   recipes are authored natively rather than translated. A second language setting would be a
   second source of truth for the same question.

What is genuinely missing is the one thing the prototype was actually about: **the assistant always
sounds like the same anonymous narrator.** So this spec is scoped to exactly that — the persona of
the live assistant — and nothing else.

**The preview button is cut.** Previewing a voice means synthesising a sample line, which means the
`TTS_PORT` we just argued against. The persona is auditioned by starting a session, which is the
context it is actually used in.

## Scope

**In:** a per-user assistant persona (voice + Arabic dialect + tone), applied when the realtime
session is minted, with a settings surface on web.

**Out:** TTS anywhere else in the app; voice for reminders, timers or the smart screen; preview;
alert opt-ins (already shipped); recipe language (already the locale); any mobile surface (the
assistant is web-only today, so a mobile persona picker would configure something the user cannot
reach).

## Design

### 1. Surface: no new routes

`GET /profile` and `PATCH /profile` already exist (`routes.ts`), are `auth: true, household: false`
— which is exactly the scope a personal voice preference needs — and
`updateProfileRequestSchema = profileSchema.omit({ userId: true }).partial()`. Adding a field to
`profileSchema` therefore produces the read path, the write path, the client method and the mobile
MSW resolver with no new route. Adding a route here would mean a new entry in the registry, a new
resolver to satisfy `mocks/coverage.spec.ts`, and a second per-user preferences endpoint competing
with the first.

`profiles` is the right table for the same reason: it is already the per-user preference store
(dietary, allergies, household size), while `reminder_settings` is household-scoped. A voice is
personal — two people sharing a kitchen should not have to agree on one.

### 2. The catalog lives in contracts

`packages/contracts/src/voice.ts` holds:

- `assistantVoiceSchema` — the ten voice ids the provider accepts.
- `assistantDialectSchema` — `levantine | gulf | egyptian | msa`.
- `assistantToneSchema` — `warm | neutral | energetic`.
- `assistantPersonaSchema` — `layla | noor | salma | omar`.
- `ASSISTANT_PERSONAS: Record<AssistantPersona, AssistantPersonaProfile>`.
- `DEFAULT_ASSISTANT_PERSONA`.

This is contract, not server detail, for the same reason `CREDIT_COSTS` is: **the voice id is a
value the provider validates.** Verified live against OpenAI — an unrecognised voice is a hard
`400` at mint, i.e. a paid-path failure, not a cosmetic one. The ten ids are the provider's own
enumeration, obtained from its rejection message rather than from documentation.

The `Record<AssistantPersona, …>` type is load-bearing: adding a persona to the enum without giving
it a voice, dialect and tone is a **compile error**, not a runtime surprise.

Persona **names and descriptions do not live here.** They live in `packages/i18n`
(`en.ts`/`ar.ts`), where `ar.ts` is typed against `en.ts`, so shipping a persona without an Arabic
name is a build error. The catalog holds behaviour; i18n holds words.

### 3. Storing an id, not the axes

`profiles.assistant_persona` stores the persona id alone — not the resolved voice, dialect and
tone.

This is a deliberate trade with a real downside: retuning ليلى later changes the voice of every
user who chose her, without their consent and without a migration. We accept it because a persona
is a **curated product decision, not user data**. Storing the three axes would let a user's stored
combination drift out of the set we actually test and would turn every persona revision into a
backfill. The narrower cost — a persona can be improved — is the one we want.

### 4. Application at mint

`AssistantService.createSession` gains the caller's `userId` and reads the persona in the **read
phase, before the spend**, alongside the pantry snapshot. The existing ordering is unchanged and is
the reason for the placement: reads → spend → mint → refund-on-throw. A read that can fail must not
happen after the debit.

`OpenAiRealtimeSessionProvider.mint` then:

- sets `session.audio.output.voice` to the persona's voice, and
- prepends persona lines (tone, and dialect when applicable) to the instructions, ahead of the
  behavioural rules and the pantry brief.

**Dialect is emitted only when the session locale is `ar`.** Levantine and Egyptian are Arabic
concepts; instructing an English session to speak Levantine would produce either code-switching or
a confused accent. In English the persona contributes voice and tone only.

Dialect steering was verified empirically, not assumed: Levantine produced «فيكي تعملي… يخنة… على
جنب» and Egyptian produced «طاجن… كشري مصري» — genuinely different lexis _and_ culinary reference,
not a relabelled default.

### 5. Failure is a fallback, never a refusal

- **No profile row** (a user who never opened settings) → default persona. `profileSchema.parse`
  already supplies defaults, so this falls out of the schema rather than needing a branch.
- **A stored id that is not in the catalog** (the catalog shrank under a user's feet) → default
  persona plus a warning log. This is the important one: **we do not fail a paid session over a
  cosmetic preference.** The user asked for an assistant, not for ليلى specifically, and refusing
  after we have charged them would be the worse outcome by a wide margin.
- **The provider rejects the voice** → the existing `AI_UNAVAILABLE` path, whose refund already
  covers it.

### 6. UI

`apps/web/src/app/(app)/settings/assistant/page.tsx`: persona cards with name, description and the
dialect. Logical properties only (`ms`/`me`, `text-start`) per the RTL lint rules. No preview
button.

The page states plainly that the voice is synthetic and the dialect is steered rather than native.
That belongs in the product, not only in this document — a user choosing "مصري" should know what
they are being promised.

## Testing

| Claim                                              | Named check                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The voice list matches what the provider accepts   | `voice.spec.ts` › "lists exactly the ten voices the provider accepts"                                 |
| Personas do not collapse onto one voice or dialect | `voice.spec.ts` › "gives every persona a distinct voice" / "offers a distinct dialect per persona"    |
| A retired persona id degrades instead of throwing  | `voice.spec.ts` › "falls back rather than throwing on an unknown stored persona"                      |
| Every persona has an Arabic name                   | `catalog.spec.ts` › "persona is fully translated into Arabic"                                         |
| The persona is read before the spend               | `assistant.service.spec.ts` › "reads the persona before charging"                                     |
| The caller's own persona is sent                   | `assistant.service.spec.ts` › "sends the caller their own persona"                                    |
| A failing persona read does not charge             | `assistant.service.spec.ts` › "does not charge when the persona read fails"                           |
| The voice reaches the provider                     | `assistant.service.spec.ts` › "sends the persona voice"                                               |
| Dialect is steered in Arabic and absent in English | `assistant.service.spec.ts` › "steers dialect only in Arabic"                                         |
| The persona is not buried behind the pantry brief  | `assistant.service.spec.ts` › "puts the persona ahead of the pantry brief"                            |
| A stale stored id degrades on the paid path        | `profiles.service.spec.ts` › "falls back to the default when the stored persona has left the catalog" |
| The persona round-trips through the database       | `profiles.service.spec.ts` › "persists the assistant persona"                                         |
| The picker is derived from the catalog             | `AssistantPersonaView.test.tsx` › "offers every persona in the catalog"                               |
| The picker saves what was pressed                  | `AssistantPersonaView.test.tsx` › "saves the persona the user picks"                                  |

**Two checks were written and then deleted.** "describes every persona" and "maps every persona to
a provider voice" could not be made to fail: `ASSISTANT_PERSONAS` is typed
`Record<AssistantPersona, AssistantPersonaProfile>`, so a missing persona, an extra one, or a voice
outside the enum all stop the package compiling before any assertion runs. Fault injection is what
proved it — the harness now reports a build failure as _"rejected by the compiler before the check
could run"_ rather than crashing, which is how the redundancy surfaced. The type is the enforcement;
keeping the tests would have made the suite look stronger than it is.

The harness's package rebuild is now keyed by **directory** rather than by one filename. The old
version named `packages/contracts/src/assistant.ts` alone, so a defect injected into any second
contract file would have run against a stale build — invisible, and reported as an uncatchable rule.

Each of these gets a case in `scripts/fault-inject-assistant.mjs`, and each injection must redden
**the check that names the behaviour** — a defect caught only by a neighbouring assertion proves
nothing. If an injection cannot redden its check, the rule is deleted rather than the test weakened.

## Known limitations

1. **Accent is unverified.** Dialect steering was confirmed by reading transcripts — the words are
   right. Whether a given synthetic voice _pronounces_ Levantine convincingly cannot be judged from
   text. One human listening pass is required before this ships.
2. **Voice gender is unverified by ear.** عمر is mapped to a voice documented as masculine. That
   documentation has not been checked against the actual audio.
3. **Persona affects the live assistant only.** Reminders, timers and the screen remain silent, by
   the argument in "Why this spec deviates" above.
4. **Web only.** The assistant has no mobile surface, so neither does its persona.
