import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeSession } from '@kitchen/contracts';
import { OpenAiRealtimeAssistantClient } from './openai-realtime';
import type { OpenAiRealtimeOptions } from './openai-realtime';
import type { AssistantEvent } from './realtime-port';

/**
 * The live assistant's real transport on **mobile** (kitchen companion spec —
 * Feature 5, Phase B).
 *
 * `react-native-webrtc` cannot load in the node-only mobile test env, so the
 * peer connection and the microphone are injected. That is a real limit of
 * these tests: they pin the wiring, the event mapping and the teardown, not
 * that a WebRTC handshake actually completes on a device.
 *
 * The structural shapes the adapter uses are derived from its own public
 * options type, so the fakes stay honest to what the adapter really consumes
 * without the file exporting internals.
 */

type PeerConnectionLike = ReturnType<NonNullable<OpenAiRealtimeOptions['createPeerConnection']>>;
type GetUserMedia = NonNullable<OpenAiRealtimeOptions['getUserMedia']>;
type StreamLike = Awaited<ReturnType<GetUserMedia>>;
type TrackLike = ReturnType<StreamLike['getAudioTracks']>[number];

const REAL_SESSION: RealtimeSession = {
  clientSecret: 'ek_live',
  expiresAt: new Date(Date.now() + 10_000).toISOString(),
  model: 'gpt-realtime',
  callsUrl: 'https://api.openai.com/v1/realtime/calls',
  isMock: false,
};

/** The adapter samples one frame every 3s once the channel opens. */
const FRAME_INTERVAL_MS = 3000;

class FakeDataChannel {
  listeners: Record<string, ((event: { data?: string }) => void)[]> = {};
  closed = false;
  sent: string[] = [];
  addEventListener(type: string, fn: (event: { data?: string }) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  send(data: string) {
    this.sent.push(data);
  }
  emit(type: string, event: { data?: string }) {
    for (const fn of this.listeners[type] ?? []) fn(event);
  }
  message(payload: unknown) {
    this.emit('message', { data: JSON.stringify(payload) });
  }
}

class FakePeerConnection {
  channel = new FakeDataChannel();
  channelLabel = '';
  closed = false;
  remote: { type: string; sdp?: string } | null = null;
  tracks: TrackLike[] = [];
  senders: { track: TrackLike | null }[] = [];
  ontrack: ((event: { streams?: StreamLike[] }) => void) | null = null;

  createDataChannel(label: string) {
    this.channelLabel = label;
    return this.channel;
  }
  addTrack(track: TrackLike) {
    this.tracks.push(track);
    const sender = { track };
    this.senders.push(sender);
    return sender;
  }
  getSenders() {
    return this.senders;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'v=0 offer' };
  }
  async setLocalDescription() {}
  async setRemoteDescription(description: { type: string; sdp?: string }) {
    this.remote = description;
  }
  close() {
    this.closed = true;
  }
}

function makeTrack(kind = 'audio') {
  return {
    kind,
    enabled: true,
    stopped: false,
    stop(this: { stopped: boolean }) {
      this.stopped = true;
    },
  };
}

/**
 * A camera track is present in `getTracks()` on purpose: without it, publishing
 * `getTracks()` instead of `getAudioTracks()` would be indistinguishable, and
 * the "never publishes the camera" check could never fail. The adapter never
 * acquires a video track itself, so this proves it publishes audio only.
 */
function makeStream(audioTrack: ReturnType<typeof makeTrack>) {
  const video = makeTrack('video');
  return {
    getAudioTracks: () => [audioTrack],
    getTracks: () => [audioTrack, video],
  };
}

function setup(
  options: {
    session?: RealtimeSession | (() => Promise<RealtimeSession>);
    sdpStatus?: number;
    captureFrame?: () => Promise<string | null>;
    getUserMedia?: () => Promise<StreamLike>;
  } = {},
) {
  const pc = new FakePeerConnection();
  const events: AssistantEvent[] = [];
  const track = makeTrack('audio');

  const fetchMock = vi.fn(
    async () => new Response('v=0 answer', { status: options.sdpStatus ?? 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const sessionOption = options.session;
  const createSession: (locale: string) => Promise<RealtimeSession> =
    typeof sessionOption === 'function' ? sessionOption : async () => sessionOption ?? REAL_SESSION;

  const frameUrl = 'data:image/jpeg;base64,FRAME';
  const captureFrame = vi.fn(options.captureFrame ?? (async () => frameUrl));
  const getUserMedia = vi.fn(
    options.getUserMedia ?? (async () => makeStream(track) as unknown as StreamLike),
  );

  const client = new OpenAiRealtimeAssistantClient({
    createSession,
    createPeerConnection: () => pc as unknown as PeerConnectionLike,
    getUserMedia: getUserMedia as unknown as GetUserMedia,
    captureFrame,
  });

  return {
    client,
    pc,
    events,
    track,
    fetchMock,
    captureFrame,
    getUserMedia,
    frameUrl,
    start: (overrides?: { camera?: boolean; audio?: boolean }) =>
      client.start({
        locale: 'en',
        camera: true,
        audio: true,
        onEvent: (event) => events.push(event),
        ...overrides,
      }),
  };
}

describe('OpenAiRealtimeAssistantClient (mobile)', () => {
  it('claims to be a demo until a session the API calls real has been minted', async () => {
    const { client, start } = setup();
    // Before start there is nothing to justify dropping the badge. This
    // direction of failure is deliberate: a scripted assistant with no badge
    // over a live camera reads as real vision, the one lie the feature must not
    // tell.
    expect(client.isMock).toBe(true);
    await start();
    expect(client.isMock).toBe(false);
    await client.stop();
  });

  it('stays a demo when the API says the deployment is mocked', async () => {
    const { client, start, events } = setup({
      session: async () => ({ ...REAL_SESSION, isMock: true }),
    });
    await start();

    expect(client.isMock).toBe(true);
    // And it must still work: the scripted adapter takes over rather than the
    // screen sitting on "connecting" forever.
    expect(events.some((event) => event.type === 'status' && event.status === 'connecting')).toBe(
      true,
    );
    await client.stop();
  });

  it('opens the oai-events data channel the provider expects', async () => {
    const { pc, start, client } = setup();
    await start();
    expect(pc.channelLabel).toBe('oai-events');
    await client.stop();
  });

  it('acquires and publishes the microphone but never the camera', async () => {
    const { pc, start, getUserMedia, client } = setup();
    await start();
    // The adapter opens the mic itself (unlike web, which is handed a stream).
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    // A speech-to-speech model gains nothing from a video track, and adding one
    // would ship the user's kitchen to the provider unannounced.
    expect(pc.tracks).toHaveLength(1);
    expect(pc.tracks[0]!.kind).toBe('audio');
    await client.stop();
  });

  it('never opens the microphone on a text-only session', async () => {
    const { pc, start, getUserMedia, events, client } = setup();
    await start({ camera: false, audio: false });
    // The phone must not listen while the user is typing.
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(pc.tracks).toHaveLength(0);
    // It still connects: the channel opening drives it live.
    pc.channel.emit('open', {});
    expect(events.some((event) => event.type === 'status' && event.status === 'live')).toBe(true);
    await client.stop();
  });

  it('POSTs the SDP offer to the session callsUrl bearing the ephemeral secret', async () => {
    const { fetchMock, pc, start, client } = setup();
    await start();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(REAL_SESSION.callsUrl);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ek_live`);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/sdp');
    expect(init.body).toBe('v=0 offer');
    expect(pc.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' });
    await client.stop();
  });

  it('goes live only when the channel opens, not when start() returns', async () => {
    const { pc, events, client, start } = setup();
    await start();
    expect(events.some((event) => event.type === 'status' && event.status === 'live')).toBe(false);

    pc.channel.emit('open', {});
    expect(events.some((event) => event.type === 'status' && event.status === 'live')).toBe(true);

    // Opening the channel also starts the frame sampler; stop so its interval
    // is cleared rather than left ticking past the test.
    await client.stop();
  });

  it('surfaces a failed mint as an error and ends, rather than hanging', async () => {
    const { events, start, fetchMock } = setup({
      session: async () => {
        throw new Error('402');
      },
    });
    await start();

    expect(events).toEqual([
      { type: 'status', status: 'connecting' },
      { type: 'error', code: 'assistant.mintFailed' },
      { type: 'status', status: 'ended' },
    ]);
    // Never reached the provider.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ends the session when the microphone is denied', async () => {
    const { events, start, pc } = setup({
      getUserMedia: async () => {
        throw new Error('denied');
      },
    });
    await start();

    expect(events.some((e) => e.type === 'error' && e.code === 'assistant.micDenied')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'status', status: 'ended' });
    // A denied mic must tear the half-open connection down, not leave it live.
    expect(pc.closed).toBe(true);
  });

  it('ends the session when the SDP exchange is rejected', async () => {
    const { events, start, track } = setup({ sdpStatus: 500 });
    await start();

    expect(events.some((e) => e.type === 'error' && e.code === 'assistant.connectFailed')).toBe(
      true,
    );
    expect(events.at(-1)).toEqual({ type: 'status', status: 'ended' });
    // A half-open connection would leave the mic light on after a failure.
    expect(track.stopped).toBe(true);
  });

  it('maps assistant and user transcripts onto the port events', async () => {
    const { pc, events, start, client } = setup();
    await start();

    pc.channel.message({
      type: 'response.output_audio_transcript.done',
      transcript: 'You have tomatoes',
      item_id: 'a1',
    });
    pc.channel.message({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'What can I cook?',
      item_id: 'u1',
    });

    expect(events.filter((event) => event.type === 'transcript')).toEqual([
      { type: 'transcript', turn: { id: 'a1', role: 'assistant', text: 'You have tomatoes' } },
      { type: 'transcript', turn: { id: 'u1', role: 'user', text: 'What can I cook?' } },
    ]);
    await client.stop();
  });

  it('drives the speaking state from the output audio buffer, not the transcript', async () => {
    const { pc, events, start, client } = setup();
    await start();

    pc.channel.message({ type: 'output_audio_buffer.started' });
    pc.channel.message({
      type: 'response.output_audio_transcript.done',
      transcript: 'You have tomatoes',
      item_id: 'a1',
    });
    pc.channel.message({ type: 'output_audio_buffer.stopped' });

    // The interleaving is the assertion: the transcript has to land *between*
    // the two speaking events and still be delivered as a transcript. Reading
    // the state off the transcript would produce the same pair of speaking
    // events — exactly how a transcript-driven indicator hides — but light up
    // late and go out while the voice was still playing.
    expect(
      events
        .filter((event) => event.type === 'speaking' || event.type === 'transcript')
        .map((event) =>
          event.type === 'speaking' ? `speaking:${event.speaking}` : `caption:${event.turn.text}`,
        ),
    ).toEqual(['speaking:true', 'caption:You have tomatoes', 'speaking:false']);
    await client.stop();
  });

  it('clears the speaking state when the user talks over the assistant', async () => {
    const { pc, events, start, client } = setup();
    await start();

    pc.channel.message({ type: 'output_audio_buffer.started' });
    // Barging in discards the queued audio: this is the event that fires, and
    // no `stopped` follows it.
    pc.channel.message({ type: 'output_audio_buffer.cleared' });

    expect(events.at(-1)).toEqual({ type: 'speaking', speaking: false });
    await client.stop();
  });

  it('puts the speaking state out when the user hangs up mid-sentence', async () => {
    const { pc, client, events, start } = setup();
    await start();

    pc.channel.message({ type: 'output_audio_buffer.started' });
    await client.stop();

    // Closing the channel produces no further server event, so the adapter has
    // to say it itself or the badge is frozen mid-word.
    expect(events.at(-1)).toEqual({ type: 'speaking', speaking: false });
  });

  it('says nothing about speaking on a stop that interrupted no speech', async () => {
    const { client, events, start } = setup();
    await start();
    await client.stop();

    expect(events.some((event) => event.type === 'speaking')).toBe(false);
  });

  it('turns a report_items tool call into detections', async () => {
    const { pc, events, start, client } = setup();
    await start();

    pc.channel.message({
      type: 'response.function_call_arguments.done',
      name: 'report_items',
      arguments: JSON.stringify({
        items: [
          {
            nameEn: 'Tomato',
            nameAr: 'طماطم',
            quantity: 3,
            unit: 'piece',
            confidence: 0.9,
            category: 'vegetable',
          },
        ],
      }),
    });

    const detections = events.find((event) => event.type === 'detections');
    expect(detections).toBeDefined();
    expect(detections!.type === 'detections' && detections!.items[0]).toMatchObject({
      nameEn: 'Tomato',
      unit: 'piece',
    });
    await client.stop();
  });

  it('accepts the exact arguments a live gpt-realtime session produced', async () => {
    // Captured from a real session (model gpt-realtime, our REPORT_ITEMS_TOOL
    // definition), byte for byte including the stray padding the model wrapped
    // the JSON in — the only evidence that what the provider actually emits
    // survives our parser.
    const LIVE_ARGS =
      '{  \n  "items": [\n    {\n      "nameEn": "tomato",\n      "nameAr": "طماطم",\n' +
      '      "quantity": 3,\n      "unit": "piece",\n      "confidence": 0.99,\n' +
      '      "category": "vegetable"\n    },\n    {\n      "nameEn": "rice",\n' +
      '      "nameAr": "أرز",\n      "quantity": 2,\n      "unit": "kg",\n' +
      '      "confidence": 0.99,\n      "category": "grain"\n    }\n  ]\n}  \n';

    const { pc, events, start, client } = setup();
    await start();

    pc.channel.message({
      type: 'response.function_call_arguments.done',
      name: 'report_items',
      arguments: LIVE_ARGS,
    });

    const detections = events.find((event) => event.type === 'detections');
    expect(detections).toBeDefined();
    // Both items, not one: a schema that rejected either would silently halve
    // the pantry the user is asked to confirm.
    expect(detections!.type === 'detections' && detections!.items).toHaveLength(2);
    expect(detections!.type === 'detections' && detections!.items[1]).toMatchObject({
      nameEn: 'rice',
      nameAr: 'أرز',
      quantity: 2,
      unit: 'kg',
      category: 'grain',
    });
    await client.stop();
  });

  it('drops a report whose items do not validate, rather than coercing them', async () => {
    const { pc, events, start, client } = setup();
    await start();

    pc.channel.message({
      type: 'response.function_call_arguments.done',
      name: 'report_items',
      arguments: JSON.stringify({
        items: [
          {
            nameEn: 'Tomato',
            nameAr: 'طماطم',
            quantity: 3,
            unit: 'bushel',
            confidence: 0.9,
            category: 'vegetable',
          },
        ],
      }),
    });

    // A silently corrected item is indistinguishable from one the model saw,
    // and this list is what the user confirms into their pantry.
    expect(events.some((event) => event.type === 'detections')).toBe(false);
    await client.stop();
  });

  it('ignores malformed channel traffic instead of throwing', async () => {
    const { pc, events, start, client } = setup();
    await start();
    const before = events.length;

    pc.channel.emit('message', { data: 'not json' });
    pc.channel.message({ type: 'something.unknown' });

    expect(events).toHaveLength(before);
    await client.stop();
  });

  it('reports a provider error event', async () => {
    const { pc, events, start, client } = setup();
    await start();
    pc.channel.message({ type: 'error', error: { message: 'rate limited' } });
    expect(events.some((e) => e.type === 'error' && e.code === 'assistant.providerError')).toBe(
      true,
    );
    await client.stop();
  });

  it('emits nothing after stop(), even if the channel keeps firing', async () => {
    const { pc, events, client, start } = setup();
    await start();
    await client.stop();
    const after = events.length;

    pc.channel.message({
      type: 'response.output_audio_transcript.done',
      transcript: 'late',
      item_id: 'a9',
    });

    expect(events).toHaveLength(after);
  });

  it('releases the microphone and the peer connection on stop', async () => {
    const { pc, client, track, start } = setup();
    await start();
    await client.stop();

    // Closing the peer connection alone leaves the OS recording indicator lit;
    // the sender track has to be stopped.
    expect(track.stopped).toBe(true);
    expect(pc.closed).toBe(true);
    expect(pc.channel.closed).toBe(true);
  });

  it('is idempotent on stop', async () => {
    const { client, start } = setup();
    await start();
    await client.stop();
    await expect(client.stop()).resolves.toBeUndefined();
  });

  describe('setMicMuted — a real mute, not a label', () => {
    it('disables and re-enables the outgoing audio track', async () => {
      const { client, track, start } = setup();
      await start();
      expect(track.enabled).toBe(true);

      client.setMicMuted(true);
      // The track actually stops carrying audio — a "muted" mic that kept
      // sending would be lying about a live microphone.
      expect(track.enabled).toBe(false);

      client.setMicMuted(false);
      expect(track.enabled).toBe(true);
      await client.stop();
    });

    it('honours a mute requested before the mic is acquired', async () => {
      const { client, track, start } = setup();
      // A session that starts muted: the flag is set before getUserMedia runs,
      // so the acquired track must come up already disabled.
      client.setMicMuted(true);
      await start();
      expect(track.enabled).toBe(false);
      await client.stop();
    });
  });

  describe('sendText — the typed half of the conversation', () => {
    function sentTypes(sent: string[]): string[] {
      return sent.map((raw) => (JSON.parse(raw) as { type: string }).type);
    }

    it('echoes the user turn, adds a text item, then asks for a response', async () => {
      const { client, pc, events, start } = setup();
      await start();
      pc.channel.emit('open', {});
      const sentBefore = pc.channel.sent.length;

      client.sendText('  what should I cook?  ');

      // The user's own words appear immediately — a typed item produces no
      // input-transcription event, so the client must echo it itself.
      const echoed = events.find((e) => e.type === 'transcript' && e.turn.role === 'user');
      expect(echoed?.type === 'transcript' && echoed.turn.text).toBe('what should I cook?');

      // A typed message is a prompt: the item is created, then a response is
      // explicitly requested (unlike a passively-sampled frame).
      const sent = pc.channel.sent.slice(sentBefore);
      expect(sentTypes(sent)).toEqual(['conversation.item.create', 'response.create']);
      const item = JSON.parse(sent[0]!) as {
        item: { role: string; content: { type: string; text: string }[] };
      };
      expect(item.item.role).toBe('user');
      expect(item.item.content[0]).toEqual({ type: 'input_text', text: 'what should I cook?' });

      await client.stop();
    });

    it('drops blank text without touching the channel', async () => {
      const { client, pc, start } = setup();
      await start();
      pc.channel.emit('open', {});
      const sentBefore = pc.channel.sent.length;

      client.sendText('   ');

      expect(pc.channel.sent).toHaveLength(sentBefore);
      await client.stop();
    });

    it('sends nothing after the session has ended', async () => {
      const { client, pc, start } = setup();
      await start();
      pc.channel.emit('open', {});
      await client.stop();
      const sentBefore = pc.channel.sent.length;

      client.sendText('are you there?');

      expect(pc.channel.sent).toHaveLength(sentBefore);
    });

    it('forwards to the scripted adapter when the deployment is mocked', async () => {
      const { client, events, start } = setup({
        session: async () => ({ ...REAL_SESSION, isMock: true }),
      });
      await start();
      const before = events.length;

      client.sendText('hello there');
      // The mock echoes the user turn synchronously, proving the call reached it.
      const echoed = events
        .slice(before)
        .find((e) => e.type === 'transcript' && e.turn.role === 'user');
      expect(echoed?.type === 'transcript' && echoed.turn.text).toBe('hello there');

      await client.stop();
    });
  });

  describe('frame sampling — giving the assistant sight', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function imageItems(channel: FakeDataChannel) {
      return channel.sent
        .map((raw) => JSON.parse(raw) as { type?: string; item?: unknown })
        .filter((message) => message.type === 'conversation.item.create');
    }

    it('feeds the camera to the model as a realtime input_image once the channel opens', async () => {
      const { pc, start, captureFrame, frameUrl, client } = setup();
      await start();
      pc.channel.emit('open', {});
      // The interval is armed but has not ticked, so no frame yet.
      expect(captureFrame).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);

      expect(captureFrame).toHaveBeenCalledTimes(1);
      const items = imageItems(pc.channel);
      expect(items).toHaveLength(1);
      // Assert the payload the model actually receives: a user message carrying
      // exactly the sampled frame, and — critically — no response.create, so a
      // frame is silent context, not a narration prompt.
      expect(items[0]!.item).toEqual({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_image', image_url: frameUrl }],
      });
      expect(pc.channel.sent.some((raw) => raw.includes('response.create'))).toBe(false);
      await client.stop();
    });

    it('samples nothing before the channel opens', async () => {
      const { pc, start, captureFrame, client } = setup();
      await start();

      // No 'open' event: the handshake is not done, so the sampler must be idle.
      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);

      expect(captureFrame).not.toHaveBeenCalled();
      expect(pc.channel.sent).toHaveLength(0);
      await client.stop();
    });

    it('never samples the camera on a voice-only (no-camera) session', async () => {
      const { pc, start, captureFrame, client } = setup();
      await start({ camera: false, audio: true });
      pc.channel.emit('open', {});

      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);

      // Voice has no camera to sample; sight is a live-mode-only affordance.
      expect(captureFrame).not.toHaveBeenCalled();
      expect(imageItems(pc.channel)).toHaveLength(0);
      await client.stop();
    });

    it('stops sampling the camera after the session ends', async () => {
      const { pc, client, start, captureFrame } = setup();
      await start();
      pc.channel.emit('open', {});
      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
      expect(captureFrame).toHaveBeenCalledTimes(1);

      await client.stop();
      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 4);

      // Clearing the interval is the one thing that ends sampling; without it
      // the camera would keep being drawn long after hang-up.
      expect(captureFrame).toHaveBeenCalledTimes(1);
    });

    it('sends no frame to the provider after the session ends', async () => {
      const { pc, client, start } = setup();
      await start();
      pc.channel.emit('open', {});
      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
      const sentWhileLive = pc.channel.sent.length;

      await client.stop();
      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 4);

      // The kitchen must not reach the provider once the user hung up.
      expect(pc.channel.sent).toHaveLength(sentWhileLive);
    });

    it('sends nothing when a capture yields no frame', async () => {
      const { pc, start, captureFrame, client } = setup({ captureFrame: async () => null });
      await start();
      pc.channel.emit('open', {});

      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);

      expect(captureFrame).toHaveBeenCalledTimes(1);
      // A failed capture is nothing at all, not an empty image item.
      expect(pc.channel.sent).toHaveLength(0);
      await client.stop();
    });

    it('never runs two captures at once when one is slow', async () => {
      let release!: (value: string | null) => void;
      const slow = vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            release = resolve;
          }),
      );
      const { pc, start, client } = setup({ captureFrame: slow });
      await start();
      pc.channel.emit('open', {});

      // Three intervals elapse while the first capture is still pending; the
      // guard must hold the next tick back rather than interleave frames.
      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
      expect(slow).toHaveBeenCalledTimes(1);

      // Once the slow capture settles, the following tick is free to sample.
      release('data:image/jpeg;base64,LATE');
      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
      expect(slow).toHaveBeenCalledTimes(2);
      expect(imageItems(pc.channel)).toHaveLength(1);
      await client.stop();
    });

    it('wires no sight on the mocked-deployment path', async () => {
      const { pc, client, start, captureFrame } = setup({
        session: async () => ({ ...REAL_SESSION, isMock: true }),
      });
      await start();

      await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);

      // The scripted adapter never opens the real channel, so the camera is
      // never sampled — the demo badge is not paired with real vision.
      expect(captureFrame).not.toHaveBeenCalled();
      expect(pc.channel.sent).toHaveLength(0);
      await client.stop();
    });
  });
});
