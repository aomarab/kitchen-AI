import type { MessageKey } from '@kitchen/i18n';
import type { AssistantStatus } from './realtime-port';

/**
 * What the assistant screen says when a session goes wrong. The adapters emit
 * `{ type: 'error', code }` and, for anything the session cannot survive, an
 * `ended` status right after. Without this mapping the screen ignored both, so
 * a failed connection looked like a live chat that never answered.
 */
const FAILURE_MESSAGE_KEYS = {
  'assistant.outOfCredits': 'errors.INSUFFICIENT_CREDITS',
  'assistant.mintFailed': 'mobile.assistant.errorMint',
  'assistant.connectFailed': 'mobile.assistant.errorConnect',
  'assistant.micDenied': 'mobile.assistant.errorMic',
  'assistant.providerError': 'mobile.assistant.errorReply',
} as const satisfies Record<string, MessageKey>;

export type AssistantFailureMessageKey =
  (typeof FAILURE_MESSAGE_KEYS)[keyof typeof FAILURE_MESSAGE_KEYS];

/** An unknown code still gets an honest "could not connect" rather than nothing. */
export function assistantFailureMessageKey(code: string): AssistantFailureMessageKey {
  return (
    (FAILURE_MESSAGE_KEYS as Record<string, AssistantFailureMessageKey>)[code] ??
    'mobile.assistant.errorConnect'
  );
}

/**
 * A mint refused for credits (HTTP 402) is the one failure Retry can never fix,
 * so the screen offers "Get more credits" instead of a dead-end retry loop.
 */
export function isOutOfCreditsFailure(code: string | null): boolean {
  return code === 'assistant.outOfCredits';
}

/** The header's connection word. `ended` must not read as "connected". */
export function assistantConnectionLabelKey(
  status: AssistantStatus,
): Extract<MessageKey, `mobile.assistant.${'connecting' | 'connected' | 'disconnected'}`> {
  if (status === 'connecting') return 'mobile.assistant.connecting';
  if (status === 'ended') return 'mobile.assistant.disconnected';
  return 'mobile.assistant.connected';
}
