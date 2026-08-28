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

/**
 * When the model's voice is actually audible.
 *
 * These are the WebRTC output-audio-buffer events, not `response.output_audio.done`.
 * The `response.*` events describe when the server finished *sending* audio,
 * which is earlier than when the speaker finishes playing it; the buffer events
 * describe the playback itself, which is what a "speaking now" light is claiming.
 *
 * `cleared` matters as much as `stopped`: it is what fires when the user talks
 * over the assistant and the queued audio is discarded. Without it, barging in
 * would leave the indicator lit over silence.
 */
const AUDIO_STARTED = 'output_audio_buffer.started';
const AUDIO_STOPPED = 'output_audio_buffer.stopped';
const AUDIO_CLEARED = 'output_audio_buffer.cleared';

interface ServerEvent {
  type?: string;
  transcript?: string;
  name?: string;
  arguments?: string;
  item_id?: string;
  event_id?: string;
  error?: { message?: string };
}

/**
 * How the assistant is given sight.
 *
 * The camera track is deliberately *not* published over RTP (see {@link
 * OpenAiRealtimeAssistantClient.start}); instead a still is sampled every
 * {@link FRAME_INTERVAL_MS} and sent over the data channel as a realtime image
 * item. Stills over a video stream is a cost decision: a continuous feed bills
 * every frame, while a bounded cadence of downscaled snapshots is tunable and
 * keeps the user's kitchen from being streamed live.
 */
const FRAME_INTERVAL_MS = 2500;
/** The longer edge each sampled frame is downscaled to before encoding. */
const FRAME_MAX_EDGE_PX = 512;
/** JPEG quality for a sampled frame — low, because it is context, not a photo. */
const FRAME_JPEG_QUALITY = 0.5;

/**
 * Draw the live stream to a downscaled JPEG data URL, or `null` if it cannot.
 *
 * Stateful on purpose: one hidden `<video>` and `<canvas>` are reused across
 * the whole session rather than recreated every {@link FRAME_INTERVAL_MS}. Like
 * the capture pipeline's `encodeResized`, it touches `play()`, canvas and
 * `toDataURL`, none of which jsdom implements — so it is covered by the manual
 * hardware gate, and tests inject their own `captureFrame`.
 */
function createFrameCapturer(): (stream: MediaStream) => Promise<string | null> {
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;

  return async (stream) => {
    try {
      if (!video) {
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
      }
      if (video.srcObject !== stream) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      // No dimensions yet means the first frame has not decoded; a draw now
      // would encode a blank canvas, which is worse than skipping this tick.
      if (!video.videoWidth || !video.videoHeight) return null;

      const scale = Math.min(1, FRAME_MAX_EDGE_PX / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);

      canvas ??= document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY);
    } catch {
      return null;
    }
  };
}

export interface OpenAiRealtimeOptions {
  /** Mints the ephemeral credential. Injected so tests need no network. */
  createSession: (locale: string) => Promise<RealtimeSession>;
  /** Overridable for tests; defaults to the browser's RTCPeerConnection. */
  createPeerConnection?: () => RTCPeerConnection;
  /**
   * Produces one downscaled JPEG data URL from the live stream, or `null` when
   * a frame cannot be made. Injected so jsdom tests need no canvas; defaults to
   * {@link createFrameCapturer}.
   */
  captureFrame?: (stream: MediaStream) => Promise<string | null>;
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
  /**
   * Kept so {@link stop} can put the speaking indicator out. Hanging up
   * mid-sentence produces no further server event — the data channel simply
   * closes — so without this the last thing the user sees is an assistant
   * frozen mid-speech.
   */
  private emit: ((event: AssistantEvent) => void) | null = null;
  private speaking = false;
  /** The live stream, kept so the frame sampler can draw from it. */
  private stream: MediaStream | null = null;
  /** Sends one downscaled still to the model on each tick while live. */
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  /** True while a capture is awaiting, so a slow encode cannot overlap itself. */
  private capturing = false;
  private readonly captureFrame: (stream: MediaStream) => Promise<string | null>;

  constructor(private readonly options: OpenAiRealtimeOptions) {
    this.captureFrame = options.captureFrame ?? createFrameCapturer();
  }

  async start({ locale, stream, onEvent }: StartAssistantOptions): Promise<void> {
    if (this.pc || this.mock) return;
    this.stopped = false;
    this.emit = onEvent;
    this.speaking = false;
    this.stream = stream;
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

    // Publish only audio over RTP. The camera track is deliberately not added:
    // sight is given as periodic downscaled stills over the data channel
    // instead (see the `open` handler below), which is cheaper than a live
    // video feed and keeps the kitchen from being streamed continuously.
    for (const track of stream?.getAudioTracks() ?? []) {
      pc.addTrack(track, stream!);
    }

    const channel = pc.createDataChannel('oai-events');
    this.channel = channel;
    channel.addEventListener('message', (event: MessageEvent<string>) => {
      this.handleServerEvent(event.data, onEvent);
    });
    channel.addEventListener('open', () => {
      if (this.stopped) return;
      onEvent({ type: 'status', status: 'live' });
      // Sight begins when the channel can carry a message, and only if there is
      // a camera to sample. A stop() before this clears the timer again.
      if ((stream?.getVideoTracks().length ?? 0) > 0) {
        this.frameTimer = setInterval(() => void this.sendFrame(), FRAME_INTERVAL_MS);
      }
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

  /**
   * Send a typed message over the same session that carries live voice — the
   * text half of the ChatGPT-voice model.
   *
   * When the deployment is mocked the scripted adapter owns the conversation,
   * so the call is forwarded to it. On a live session the message is added as a
   * user turn and a response is explicitly requested: unlike a sampled frame (a
   * passive piece of context), a typed message *is* a prompt, so `response.create`
   * follows it. The user's own words are echoed into the transcript locally,
   * because a typed item — unlike spoken audio — produces no input-transcription
   * event to bounce them back. Blank text is dropped, and a send after stop()
   * closed the channel is a no-op rather than a throw, mirroring the sampler.
   */
  sendText(text: string): void {
    if (this.mock) {
      this.mock.sendText(text);
      return;
    }
    if (this.stopped) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    this.emit?.({
      type: 'transcript',
      turn: { id: `u-typed-${this.detectionSeq++}`, role: 'user', text: trimmed },
    });
    this.channel?.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: trimmed }],
        },
      }),
    );
    this.channel?.send(JSON.stringify({ type: 'response.create' }));
  }

  /**
   * Sample one frame and hand it to the model as conversation context.
   *
   * It is added as a user message with `input_image` content and **no**
   * `response.create` follows: the frame is context the model draws on when the
   * user next speaks (server VAD drives responses), not a prompt to narrate
   * every 2.5 seconds. The write to inventory still goes through `report_items`
   * → confirm, so nothing here touches the ledger.
   *
   * The guards are deliberately minimal and single-purpose, so each is
   * falsifiable rather than masked by another:
   *
   * - `capturing` is the only thing serialising captures — a slow encode must
   *   not let the next tick start a second one and interleave frames.
   * - the send is `channel?.send`, so a stop() that closed the channel
   *   mid-capture drops the in-flight frame with no throw and no leak. This is
   *   what keeps the kitchen from being sent after the user hung up, so it is
   *   *not* duplicated with a `stopped` check that would make either redundant.
   *
   * Sampling itself is stopped by clearing the interval in {@link stop}, which
   * is why `stop()` leaves `this.stream` in place: the cleared timer is the one
   * thing that ends the capture work, and nothing else should also end it.
   */
  private async sendFrame(): Promise<void> {
    if (this.capturing || !this.stream) return;
    this.capturing = true;
    try {
      const imageUrl = await this.captureFrame(this.stream);
      if (!imageUrl) return;
      this.channel?.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_image', image_url: imageUrl }],
          },
        }),
      );
    } finally {
      this.capturing = false;
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

    if (event.type === AUDIO_STARTED) {
      this.speaking = true;
      onEvent({ type: 'speaking', speaking: true });
      return;
    }

    if (event.type === AUDIO_STOPPED || event.type === AUDIO_CLEARED) {
      this.speaking = false;
      onEvent({ type: 'speaking', speaking: false });
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

    // Stop sampling before the channel closes. Clearing the interval is the one
    // thing that ends the capture work; `this.stream` is deliberately left in
    // place (it is replaced on the next start) so nothing else silently ends
    // sampling too. A frame that was mid-capture is dropped by the closed
    // channel below, so no frame is sent after the user hung up.
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }

    // Before anything is torn down: the voice has stopped, by definition.
    if (this.speaking) {
      this.speaking = false;
      this.emit?.({ type: 'speaking', speaking: false });
    }
    this.emit = null;

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
