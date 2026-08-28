import type { AssistantPersona, Locale, RealtimeSession } from '@kitchen/contracts';

/**
 * Mints the short-lived credential the browser uses to open a realtime peer
 * connection (spec Feature 5, Phase B).
 *
 * This is a port for the same reason every other outbound call in `src/ai` is:
 * the mock adapter lets the whole live-assistant surface run offline with no
 * key, and the real vendor can be swapped without the controller knowing.
 *
 * Note what this port deliberately does **not** do: it does not proxy the
 * session. Audio goes client↔provider, so no adapter here ever sees a frame,
 * a token count or a transcript.
 */
export interface RealtimeSessionProvider {
  /** `true` when sessions minted here are scripted rather than live. */
  readonly isMock: boolean;
  /**
   * Exchange our long-lived provider key for an ephemeral client secret.
   *
   * Throws rather than returning a partial session: a caller that received a
   * session without a usable secret would charge the household and then fail
   * to connect.
   *
   * `pantryBrief` is the household's Stage-A snapshot rendered as text. It is
   * passed in rather than fetched here so this port stays a pure vendor
   * adapter with no database of its own.
   *
   * `persona` arrives already resolved for the same reason: the caller owns the
   * fallback for a stored id that has left the catalog, so an adapter is handed
   * a value it can always honour.
   */
  mint(locale: Locale, pantryBrief: string, persona: AssistantPersona): Promise<RealtimeSession>;
}
