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
 * The live assistant's real transport on **mobile** (kitchen companion spec —
 * Feature 5, Phase B). A behaviour-for-behaviour twin of the web adapter
 * (`apps/web/src/lib/assistant/openai-realtime.ts`); it exists separately only
 * because React Native and the browser share no realtime transport — the
 * browser has `RTCPeerConnection` and `<audio>`, mobile has `react-native-webrtc`.
 *
 * Audio goes phone↔provider over WebRTC rather than through our API, because
 * relaying it would add a round trip to every syllable. The API's only part is
 * minting the ephemeral credential this class is handed — our provider key is
 * never on the device.
 *
 * `isMock` is `false`, which removes the demo badge. That is the one thing in
 * this file that must never be set optimistically: the badge is what stops a
 * scripted answer over a real camera from reading as real vision. When the API
 * says the deployment is mocked (no realtime key configured yet), this class
 * hands off to {@link MockRealtimeAssistantClient} and the badge stays lit.
 *
 * Every dependency on the native module is behind a factory (`createPeerConnection`,
 * `getUserMedia`) that is only reached on a real session, so the node-only
 * mobile test env never loads `react-native-webrtc`.
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
 * When the model's voice is actually audible. These are the WebRTC
 * output-audio-buffer events, not `response.output_audio.done`, which describes
 * when the server finished *sending* audio — earlier than when the speaker
 * finishes playing it. `cleared` matters as much as `stopped`: it fires when the
 * user talks over the assistant and the queued audio is discarded, so without it
 * barging in would leave the indicator lit over silence.
 */
const AUDIO_STARTED = 'output_audio_buffer.started';
const AUDIO_STOPPED = 'output_audio_buffer.stopped';
const AUDIO_CLEARED = 'output_audio_buffer.cleared';

/**
 * How the assistant is given sight. The camera track is deliberately *not*
 * published over RTP; instead a downscaled still is sampled every
 * {@link FRAME_INTERVAL_MS} and sent over the data channel as a realtime image
 * item. Stills over a video stream is a cost decision: a continuous feed bills
 * every frame, while a bounded cadence of downscaled snapshots is tunable and
 * keeps the user's kitchen from being streamed live. The still itself is
 * produced by the screen (expo-camera has no silent frame API, so this is a
 * `takePictureAsync`), which is why the sampler is injected rather than built
 * here.
 */
const FRAME_INTERVAL_MS = 3000;

/** ICE config. A public STUN helps NAT traversal on cellular, where the phone
 * and the provider's media server are rarely on the same network. */
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } as const;

interface ServerEvent {
  type?: string;
  transcript?: string;
  name?: string;
  arguments?: string;
  item_id?: string;
  event_id?: string;
  error?: { message?: string };
}

/* --------------------------------------------------------------------------
 * Structural shapes for the slice of `react-native-webrtc` this adapter uses.
 * Defining them here rather than importing the module's types keeps the file
 * decoupled from the native package and lets the node test env inject fakes.
 * ------------------------------------------------------------------------ */

interface TrackLike {
  kind: string;
  enabled: boolean;
  stop(): void;
}

interface StreamLike {
  getAudioTracks(): TrackLike[];
  getTracks(): TrackLike[];
}

interface DataChannelLike {
  addEventListener(type: 'message' | 'open', listener: (event: { data?: string }) => void): void;
  send(data: string): void;
  close(): void;
}

interface SenderLike {
  track: TrackLike | null;
}

interface PeerConnectionLike {
  ontrack: ((event: { streams?: StreamLike[] }) => void) | null;
  addTrack(track: TrackLike, stream: StreamLike): unknown;
  createDataChannel(label: string): DataChannelLike;
  createOffer(options?: unknown): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(description: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(description: { type: string; sdp?: string }): Promise<void>;
  getSenders(): SenderLike[];
  close(): void;
}

type GetUserMedia = (constraints: { audio: boolean; video: boolean }) => Promise<StreamLike>;

/**
 * Lazily reach the native module, only ever on a real session. A static import
 * would load `react-native-webrtc` when this file is imported, which the
 * node-only mobile test env cannot do.
 */
function nativeWebrtc(): {
  RTCPeerConnection: new (config: unknown) => PeerConnectionLike;
  mediaDevices: { getUserMedia: GetUserMedia };
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-webrtc');
}

export interface OpenAiRealtimeOptions {
  /** Mints the ephemeral credential. Injected so tests need no network. */
  createSession: (locale: string) => Promise<RealtimeSession>;
  /** Overridable for tests; defaults to the native RTCPeerConnection. */
  createPeerConnection?: () => PeerConnectionLike;
  /** Overridable for tests; defaults to the native microphone. */
  getUserMedia?: GetUserMedia;
  /**
   * Produces one downscaled JPEG data URL from the live camera, or `null` when
   * a frame cannot be made. Injected by the screen (it owns the `CameraView`),
   * and absent in a voice/text session. The web adapter samples a `MediaStream`
   * with a canvas; mobile has neither, so the screen hands over a
   * `takePictureAsync` + resize instead.
   */
  captureFrame?: () => Promise<string | null>;
}

export class OpenAiRealtimeAssistantClient implements RealtimeAssistantClient {
  /**
   * Starts `true` and only drops once the API has minted a session it states is
   * real. The badge this drives fails safe in the direction that matters: an
   * assistant wrongly labelled "demo" is a cosmetic bug, while a scripted one
   * wearing no badge over a live camera is a lie about vision.
   */
  get isMock(): boolean {
    return !this.mintedReal;
  }

  private mintedReal = false;
  /** Set when the API says this deployment is mocked; we then defer to it. */
  private mock: MockRealtimeAssistantClient | null = null;
  private pc: PeerConnectionLike | null = null;
  private channel: DataChannelLike | null = null;
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
  /** The outgoing mic tracks, kept so mute can disable them and stop can end them. */
  private micTracks: TrackLike[] = [];
  /** Sends one downscaled still to the model on each tick while live. */
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  /** True while a capture is awaiting, so a slow encode cannot overlap itself. */
  private capturing = false;
  /** Last requested mute state, applied to tracks acquired after the toggle. */
  private micMuted = false;

  private readonly createPeerConnection: () => PeerConnectionLike;
  private readonly getUserMedia: GetUserMedia;
  private readonly captureFrame?: () => Promise<string | null>;

  constructor(private readonly options: OpenAiRealtimeOptions) {
    this.createPeerConnection =
      options.createPeerConnection ?? (() => new (nativeWebrtc().RTCPeerConnection)(RTC_CONFIG));
    this.getUserMedia =
      options.getUserMedia ?? ((c) => nativeWebrtc().mediaDevices.getUserMedia(c));
    this.captureFrame = options.captureFrame;
  }

  async start({ locale, camera, audio, onEvent }: StartAssistantOptions): Promise<void> {
    if (this.pc || this.mock) return;
    this.stopped = false;
    this.emit = onEvent;
    this.speaking = false;
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
      await this.mock.start({ locale, camera, audio, onEvent });
      return;
    }
    this.mintedReal = true;

    const pc = this.createPeerConnection();
    this.pc = pc;
    // Remote audio is played by the native module once a track arrives; there is
    // no sink to attach as there is in the browser. The handler exists only so a
    // future speaker-routing hook has somewhere to live.
    pc.ontrack = () => {};

    // Acquire and publish the microphone, unless this is a text-only session.
    // Publishing only audio is deliberate: a speech-to-speech model gains
    // nothing from a video track, and adding one would ship the user's kitchen
    // to the provider unannounced — sight is given as periodic stills instead.
    if (audio !== false) {
      try {
        const stream = await this.getUserMedia({ audio: true, video: false });
        if (this.stopped) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        for (const track of stream.getAudioTracks()) {
          track.enabled = !this.micMuted;
          this.micTracks.push(track);
          pc.addTrack(track, stream);
        }
      } catch {
        onEvent({ type: 'error', code: 'assistant.micDenied' });
        await this.stop();
        onEvent({ type: 'status', status: 'ended' });
        return;
      }
    }

    const channel = pc.createDataChannel('oai-events');
    this.channel = channel;
    channel.addEventListener('message', (event) => {
      this.handleServerEvent(event.data ?? '', onEvent);
    });
    channel.addEventListener('open', () => {
      if (this.stopped) return;
      onEvent({ type: 'status', status: 'live' });
      // Sight begins when the channel can carry a message, and only if there is
      // a camera to sample. A stop() before this clears the timer again.
      if (camera && this.captureFrame) {
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
   * text half of the model. Forwarded to the scripted adapter when the
   * deployment is mocked. On a live session the message is added as a user turn
   * and a response is explicitly requested (a typed message *is* a prompt,
   * unlike a passively sampled frame). The user's words are echoed locally
   * because a typed item produces no input-transcription event to bounce them
   * back. Blank text is dropped; a send after stop() is a no-op.
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
   * Enable or disable the outgoing mic track. On the scripted adapter this is
   * cosmetic (it reads no audio), so the call is forwarded; on a live session it
   * genuinely stops the phone sending audio, which is what a "muted" indicator
   * is claiming. The last state is remembered so a track acquired after the
   * toggle (a session that starts muted) honours it too.
   */
  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    if (this.mock) {
      this.mock.setMicMuted?.(muted);
      return;
    }
    for (const track of this.micTracks) track.enabled = !muted;
  }

  /**
   * Sample one frame and hand it to the model as conversation context. It is
   * added as a user message with `input_image` content and **no**
   * `response.create` follows: the frame is context the model draws on when the
   * user next speaks (server VAD drives responses), not a prompt to narrate
   * every few seconds. The write to inventory still goes through `report_items`
   * → confirm, so nothing here touches the ledger.
   *
   * `capturing` is the only thing serialising captures — a slow encode must not
   * let the next tick start a second one. The send is `channel?.send`, so a
   * stop() that closed the channel mid-capture drops the in-flight frame with no
   * throw and no leak, which is what keeps the kitchen from being sent after the
   * user hung up.
   */
  private async sendFrame(): Promise<void> {
    if (this.capturing || !this.captureFrame) return;
    this.capturing = true;
    try {
      const imageUrl = await this.captureFrame();
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
      // An empty result is not the same as no result: reporting `[]` after every
      // failed parse would flicker the detection list to empty whenever the
      // model returned something malformed.
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
    // thing that ends the capture work; a frame mid-capture is dropped by the
    // closed channel below, so no frame is sent after the user hung up.
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
    // closed peer connection alone leaves the OS recording indicator on.
    for (const sender of this.pc?.getSenders() ?? []) sender.track?.stop();
    for (const track of this.micTracks) track.stop();
    this.micTracks = [];
    this.pc?.close();
    this.pc = null;
  }
}
