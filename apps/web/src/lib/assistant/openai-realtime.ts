import { z } from 'zod';
import { ingredientCategorySchema, unitSchema } from '@kitchen/contracts';
import type { RealtimeSession } from '@kitchen/contracts';
import type {
  AssistantEvent,
  DetectedItem,
  RealtimeAssistantClient,
  StartAssistantOptions,
} from './realtime-port';
import { MockRealtimeAssistantClient } from './mock-realtime';

/**
 * The live assistant's real transport (spec Feature 5, Phase B).
 *
 * Audio goes browser↔provider over WebRTC rather than through our API, because
 * relaying it would add a round trip to every syllable. The API's only part is
 * minting the ephemeral credential this class is handed — our provider key is
 * never in the browser.
 *
 * `isMock` is `false`, which removes the demo badge. That is the one thing in
 * this file that must never be set optimistically: the badge is what stops a
 * scripted answer over a real camera from reading as real vision.
 */

/**
 * Items the model reports, re-validated here.
 *
 * The tool definition sent with the session already constrains these, but a
 * tool schema is a prompt and not a guarantee — the model can return an unknown
 * unit or a confidence of 4. Anything that fails is dropped rather than coerced,
 * because a silently corrected item is indistinguishable from one the model
 * actually saw.
 */
const reportedItemSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  quantity: z.number().nullable(),
  unit: unitSchema,
  confidence: z.number().min(0).max(1),
  category: ingredientCategorySchema,
});

const reportItemsArgsSchema = z.object({ items: z.array(reportedItemSchema) });

/** Server events we act on. Everything else on the data channel is ignored. */
const TRANSCRIPT_DONE = 'response.output_audio_transcript.done';
const USER_TRANSCRIPT_DONE = 'conversation.item.input_audio_transcription.completed';
const FUNCTION_ARGS_DONE = 'response.function_call_arguments.done';

interface ServerEvent {
  type?: string;
  transcript?: string;
  name?: string;
  arguments?: string;
  item_id?: string;
  event_id?: string;
  error?: { message?: string };
}

export interface OpenAiRealtimeOptions {
  /** Mints the ephemeral credential. Injected so tests need no network. */
  createSession: (locale: string) => Promise<RealtimeSession>;
  /** Overridable for tests; defaults to the browser's RTCPeerConnection. */
  createPeerConnection?: () => RTCPeerConnection;
}

export class OpenAiRealtimeAssistantClient implements RealtimeAssistantClient {
  /**
   * Starts `true` and only drops once the API has minted a session it states is
   * real. The badge this drives fails safe in the direction that matters: an
   * assistant wrongly labelled "demo" is a cosmetic bug, while a scripted one
   * wearing no badge over a live camera is a lie about vision.
   *
   * This is deliberately one flag and not `mock !== null || !mintedReal`: the
   * mock path never sets `mintedReal`, so the extra clause could not change any
   * answer, and a condition no defect can falsify is not a safeguard.
   */
  get isMock(): boolean {
    return !this.mintedReal;
  }

  private mintedReal = false;
  /** Set when the API says this deployment is mocked; we then defer to it. */
  private mock: MockRealtimeAssistantClient | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private audio: HTMLAudioElement | null = null;
  private stopped = false;
  private detectionSeq = 0;

  constructor(private readonly options: OpenAiRealtimeOptions) {}

  async start({ locale, stream, onEvent }: StartAssistantOptions): Promise<void> {
    if (this.pc || this.mock) return;
    this.stopped = false;
    onEvent({ type: 'status', status: 'connecting' });

    let session: RealtimeSession;
    try {
      session = await this.options.createSession(locale);
    } catch {
      // The mint is where credits are spent and where an outage shows up first.
      onEvent({ type: 'error', code: 'assistant.mintFailed' });
      onEvent({ type: 'status', status: 'ended' });
      return;
    }

    // A mocked deployment mints an unusable secret on purpose. Attempting the
    // SDP exchange with it would fail, so hand over to the scripted adapter —
    // which keeps `isMock` true and the demo badge on.
    if (session.isMock) {
      this.mock = new MockRealtimeAssistantClient();
      await this.mock.start({ locale, stream, onEvent });
      return;
    }
    this.mintedReal = true;
    const pc = (this.options.createPeerConnection ?? (() => new RTCPeerConnection()))();
    this.pc = pc;

    // The model's voice arrives as a remote track. Without an <audio> sink
    // attached the connection succeeds and the assistant is simply inaudible.
    pc.ontrack = (event) => {
      if (!this.audio) {
        this.audio = document.createElement('audio');
        this.audio.autoplay = true;
      }
      this.audio.srcObject = event.streams[0] ?? null;
    };

    // Send only audio. The camera track is deliberately not published: this
    // model is speech-to-speech, and adding a video track would ship the user's
    // kitchen to the provider for no benefit they were told about.
    for (const track of stream?.getAudioTracks() ?? []) {
      pc.addTrack(track, stream!);
    }

    const channel = pc.createDataChannel('oai-events');
    this.channel = channel;
    channel.addEventListener('message', (event: MessageEvent<string>) => {
      this.handleServerEvent(event.data, onEvent);
    });
    channel.addEventListener('open', () => {
      if (!this.stopped) onEvent({ type: 'status', status: 'live' });
    });

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answer = await fetch(`${session.callsUrl}?model=${encodeURIComponent(session.model)}`, {
        method: 'POST',
        body: offer.sdp ?? '',
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!answer.ok) throw new Error(`sdp exchange failed: ${answer.status}`);

      // A stop() during the exchange must not resurrect the connection.
      if (this.stopped) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
    } catch {
      onEvent({ type: 'error', code: 'assistant.connectFailed' });
      await this.stop();
      onEvent({ type: 'status', status: 'ended' });
    }
  }

  private handleServerEvent(raw: string, onEvent: (event: AssistantEvent) => void): void {
    if (this.stopped) return;

    let event: ServerEvent;
    try {
      event = JSON.parse(raw) as ServerEvent;
    } catch {
      return;
    }

    if (event.type === 'error') {
      onEvent({ type: 'error', code: 'assistant.providerError' });
      return;
    }

    if (event.type === TRANSCRIPT_DONE && event.transcript) {
      onEvent({
        type: 'transcript',
        turn: {
          id: event.item_id ?? event.event_id ?? `a${this.detectionSeq++}`,
          role: 'assistant',
          text: event.transcript,
        },
      });
      return;
    }

    if (event.type === USER_TRANSCRIPT_DONE && event.transcript) {
      onEvent({
        type: 'transcript',
        turn: {
          id: event.item_id ?? event.event_id ?? `u${this.detectionSeq++}`,
          role: 'user',
          text: event.transcript,
        },
      });
      return;
    }

    if (event.type === FUNCTION_ARGS_DONE && event.name === 'report_items' && event.arguments) {
      const items = this.parseDetections(event.arguments);
      // An empty result is not the same as no result: reporting `[]` here after
      // every failed parse would flicker the detection list to empty whenever
      // the model returned something malformed.
      if (items) onEvent({ type: 'detections', items });
    }
  }

  /** `null` when the payload is unusable; otherwise the items that validated. */
  private parseDetections(raw: string): DetectedItem[] | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const result = reportItemsArgsSchema.safeParse(parsed);
    if (!result.success) return null;

    return result.data.items.map((item, index) => ({
      ...item,
      // Ids are for React keys and de-duping only; the model does not supply
      // stable ones, so they are minted per report.
      id: `rt-${this.detectionSeq++}-${index}`,
    }));
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    if (this.mock) {
      await this.mock.stop();
      this.mock = null;
      return;
    }

    this.channel?.close();
    this.channel = null;

    // Stopping the sender tracks is what actually releases the microphone. A
    // closed peer connection alone leaves the browser's recording indicator on.
    for (const sender of this.pc?.getSenders() ?? []) sender.track?.stop();
    this.pc?.close();
    this.pc = null;

    if (this.audio) {
      this.audio.srcObject = null;
      this.audio = null;
    }
  }
}
