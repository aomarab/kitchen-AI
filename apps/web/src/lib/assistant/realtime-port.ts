import type { Locale } from '@kitchen/i18n';
import type { IngredientCategory, Unit } from '@kitchen/contracts';

/**
 * The client half of the live camera + voice assistant (design spec §5,
 * Feature 5). This is the port; a concrete adapter owns the realtime transport.
 *
 * Two things are deliberate here:
 *
 * 1. The transport is client↔provider (WebRTC/WebSocket to a realtime multimodal
 *    model), not a request/response API route. Offline there is no provider to
 *    reach, so this phase ships only the {@link MockRealtimeAssistantClient};
 *    the real OpenAI-Realtime/Gemini-Live adapter implements the same interface
 *    later, behind an ephemeral token the API mints.
 *
 * 2. `isMock` is surfaced so the UI can wear a persistent "demo" badge whenever
 *    the assistant is scripted rather than live — a real camera feed with a
 *    mock assistant must never read as real vision.
 */

/** A single item the assistant reports seeing. Never auto-written to inventory. */
export interface DetectedItem {
  /** Stable id within a session, for React keys and de-duping. */
  id: string;
  nameEn: string;
  nameAr: string;
  /** `null` when the assistant cannot count them. */
  quantity: number | null;
  unit: Unit;
  /** 0..1. */
  confidence: number;
  category: IngredientCategory;
}

/** One turn of the spoken conversation, transcribed. */
export interface TranscriptTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export type AssistantStatus = 'connecting' | 'live' | 'ended';

/** Everything the transport pushes back to the UI. */
export type AssistantEvent =
  | { type: 'status'; status: AssistantStatus }
  /**
   * The assistant's voice started or stopped coming out of the speaker.
   *
   * This is a transport fact, not a UI guess. It cannot be inferred from the
   * transcript: a transcript turn arrives when the *text* is done, which is
   * after the audio began and often before it has finished playing, so a
   * "speaking" light driven by transcripts would light up late and go out at
   * the wrong moment. Adapters emit it from whatever their provider says about
   * the output audio itself, and must emit `false` when a session ends so the
   * indicator cannot be left lit by a hang-up mid-sentence.
   */
  | { type: 'speaking'; speaking: boolean }
  | { type: 'transcript'; turn: TranscriptTurn }
  | { type: 'detections'; items: DetectedItem[] }
  | { type: 'error'; code: string };

export interface StartAssistantOptions {
  locale: Locale;
  /**
   * The live camera+mic stream. A real adapter forwards frames/audio over the
   * transport; the mock ignores it (nothing leaves the device offline). The
   * stream is still real — consent and preview do not depend on the provider.
   */
  stream: MediaStream | null;
  onEvent: (event: AssistantEvent) => void;
}

export interface RealtimeAssistantClient {
  /** Drives the UI's demo badge. `true` for any scripted/offline provider. */
  readonly isMock: boolean;
  /** Begin a session. Emits `status: 'connecting'` then `'live'`, then events. */
  start(options: StartAssistantOptions): Promise<void>;
  /** End the session and release every timer/handle it holds. Idempotent. */
  stop(): Promise<void>;
}
