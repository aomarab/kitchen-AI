import { z } from 'zod';
import { isoDateTimeSchema, localeSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Live assistant realtime sessions                                    */
/* (kitchen companion spec — Feature 5, Phase B)                       */
/* ------------------------------------------------------------------ */

/**
 * The live assistant's transport is client↔provider: the browser holds a WebRTC
 * peer connection straight to the realtime model, because routing audio through
 * our API would add a round trip to every syllable.
 *
 * That makes this route the *only* server-side choke point for the feature. It
 * exists to keep the provider key off the client: the API exchanges its own key
 * for a short-lived client secret and returns that instead. Nothing else about
 * the session passes through us.
 *
 * Because we never see the traffic, we also never see the usage — see
 * {@link REALTIME_SECRET_TTL_SEC} for what that costs us and how it is bounded.
 */

/**
 * How long a minted client secret stays valid, in seconds.
 *
 * This is a cost control, not a UX knob, and it is deliberately at the
 * provider's floor of 10s. A client secret may start **any number of sessions**
 * until it expires, so its TTL — not the session length — is what bounds how
 * much a single mint can spend. At the provider's 600s default, one paid mint
 * would authorise ten minutes of re-connections; at 10s it authorises the one
 * connection the user just asked for, and continuing costs another mint.
 *
 * Session *duration* is not bounded by this and cannot be bounded by us: once
 * connected, the session is between the client and the provider, and the
 * provider does not offer a server-set hard limit we can rely on. That is a
 * real, stated limitation of this design, not an oversight.
 */
export const REALTIME_SECRET_TTL_SEC = 10;

/** Provider floor/ceiling for the secret TTL, per the Realtime API reference. */
export const REALTIME_SECRET_TTL_MIN_SEC = 10;
export const REALTIME_SECRET_TTL_MAX_SEC = 7200;

/**
 * Client-side ceiling on a single live-assistant session, in milliseconds.
 *
 * The server *cannot* bound session duration (see {@link REALTIME_SECRET_TTL_SEC}):
 * once the peer connection is open, the audio is strictly between client and
 * provider and the provider offers no server-set hard limit. This is the
 * complementary guard the *client* can enforce — a best-effort auto-hangup so a
 * session left open on a counter cannot run the provider's per-minute meter
 * indefinitely.
 *
 * It protects the honest common case (a forgotten tab, a phone put down
 * mid-conversation), not a modified client, which by definition ignores it. When
 * it fires the user is told the session paused and may resume, which mints a
 * fresh secret and opens a new connection. Both clients share this value so the
 * web and mobile assistants pause at the same point.
 */
export const MAX_ASSISTANT_SESSION_MS = 5 * 60_000;

/**
 * What the client needs to open a peer connection, and nothing more.
 *
 * `clientSecret` is the provider's ephemeral token (`ek_…`). It is a bearer
 * credential with real spending power for {@link REALTIME_SECRET_TTL_SEC}, so
 * it is never persisted, never logged, and never cached.
 */
export const realtimeSessionSchema = z.object({
  /** Ephemeral provider token. Short-lived; treat as a secret. */
  clientSecret: z.string().min(1),
  /** When the secret stops being usable to start new sessions. */
  expiresAt: isoDateTimeSchema,
  /** The realtime model the secret is bound to. */
  model: z.string().min(1),
  /**
   * The URL the client POSTs its SDP offer to. Server-supplied so that swapping
   * provider or API version does not require shipping a new client.
   */
  callsUrl: z.string().url(),
  /**
   * `true` when the session is scripted rather than live.
   *
   * The UI turns this straight into a persistent "demo" badge. It is part of
   * the contract rather than a client-side guess because a real camera feed
   * paired with a scripted assistant must never be able to read as real vision
   * — and the client cannot tell the difference by looking at the token.
   */
  isMock: z.boolean(),
});
export type RealtimeSession = z.infer<typeof realtimeSessionSchema>;

export const createRealtimeSessionRequestSchema = z.object({
  /**
   * Spoken language for the session. Sent to the provider as session config so
   * the assistant answers in the household's language natively rather than
   * translating, matching how every other prompt in the system carries locale.
   */
  locale: localeSchema,
});
export type CreateRealtimeSessionRequest = z.infer<typeof createRealtimeSessionRequestSchema>;
