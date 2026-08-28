import type { Locale } from '@kitchen/i18n';
import type { IngredientCategory, Unit } from '@kitchen/contracts';

/**
 * The client half of the live camera + voice assistant on **mobile** (design
 * spec Feature 5; `2026-08-28-mobile-live-assistant-design.md`). This is the
 * port; a concrete adapter owns the realtime transport.
 *
 * It mirrors the web port (`apps/web/src/lib/assistant/realtime-port.ts`) with
 * one deliberate difference: {@link StartAssistantOptions} carries **no**
 * `MediaStream`. That is a browser type React Native does not have, and the
 * only adapter that ships today — the mock — never read the stream anyway. When
 * a real `react-native-webrtc` adapter lands it will take whatever camera/track
 * handle that module exposes; putting a DOM type here now would be a lie about
 * what mobile can produce.
 *
 * Two things stay exactly as web:
 *
 * 1. The transport is client↔provider (WebRTC to a realtime multimodal model),
 *    not a request/response API route. So this phase ships only the
 *    {@link MockRealtimeAssistantClient}; the real adapter implements the same
 *    interface later, behind an ephemeral token the API mints.
 * 2. `isMock` is surfaced so the UI can wear a persistent "demo" badge whenever
 *    the assistant is scripted rather than live — a real camera feed with a
 *    mock assistant must never read as real vision.
 */

/** A single item the assistant reports seeing. Never auto-written to inventory. */
export interface DetectedItem {
  /** Stable id within a session, for keys and de-duping. */
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
   * A transport fact, not a UI guess: it cannot be inferred from the transcript,
   * which is final after the audio began and often before it has finished. The
   * mock emits it from its own script; a real adapter emits it from whatever its
   * provider says about the output audio. Either way it must emit `false` when a
   * session ends so a hang-up mid-sentence cannot leave the indicator lit.
   */
  | { type: 'speaking'; speaking: boolean }
  | { type: 'transcript'; turn: TranscriptTurn }
  | { type: 'detections'; items: DetectedItem[] }
  | { type: 'error'; code: string };

export interface StartAssistantOptions {
  locale: Locale;
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
