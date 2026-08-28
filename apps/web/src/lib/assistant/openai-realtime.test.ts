import { describe, expect, it, vi } from 'vitest';
import type { RealtimeSession } from '@kitchen/contracts';
import { OpenAiRealtimeAssistantClient } from './openai-realtime';
import type { AssistantEvent } from './realtime-port';

/**
 * The live assistant's real transport (kitchen companion spec — Feature 5,
 * Phase B).
 *
 * `RTCPeerConnection` does not exist in jsdom, so the peer connection is
 * injected. That is a real limit of these tests: they pin the wiring, the event
 * mapping and the teardown, not that a WebRTC handshake actually completes.
 */

const REAL_SESSION: RealtimeSession = {
  clientSecret: 'ek_live',
  expiresAt: new Date(Date.now() + 10_000).toISOString(),
  model: 'gpt-realtime',
  callsUrl: 'https://api.openai.com/v1/realtime/calls',
  isMock: false,
};

class FakeDataChannel {
  listeners: Record<string, ((event: unknown) => void)[]> = {};
  closed = false;
  addEventListener(type: string, fn: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, event: unknown) {
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
  remote: RTCSessionDescriptionInit | null = null;
  tracks: MediaStreamTrack[] = [];
  senders: { track: { stop: () => void; stopped?: boolean } }[] = [];
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;

  createDataChannel(label: string) {
    this.channelLabel = label;
    return this.channel;
  }
  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
    const sender = { track: Object.assign(track, { stopped: false }) };
    this.senders.push(sender as never);
    return sender;
  }
  getSenders() {
    return this.senders;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'v=0 offer' };
  }
  async setLocalDescription() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remote = description;
  }
  close() {
    this.closed = true;
  }
}

function makeTrack(): MediaStreamTrack {
  const track = { kind: 'audio', stopped: false, stop() {} } as unknown as MediaStreamTrack;
  vi.spyOn(track, 'stop').mockImplementation(() => {
    (track as unknown as { stopped: boolean }).stopped = true;
  });
  return track;
}

function makeStream(track: MediaStreamTrack): MediaStream {
  // A camera track is present on purpose: without it, publishing `getTracks()`
  // instead of `getAudioTracks()` would be indistinguishable, and the check
  // below could never fail.
  const video = { kind: 'video', stop() {} } as unknown as MediaStreamTrack;
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track, video],
  } as unknown as MediaStream;
}

function setup(
  options: {
    session?: RealtimeSession | (() => Promise<RealtimeSession>);
    sdpStatus?: number;
  } = {},
) {
  const pc = new FakePeerConnection();
  const events: AssistantEvent[] = [];
  const track = makeTrack();

  const fetchMock = vi.fn(
    async () => new Response('v=0 answer', { status: options.sdpStatus ?? 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const sessionOption = options.session;
  const createSession: (locale: string) => Promise<RealtimeSession> =
    typeof sessionOption === 'function' ? sessionOption : async () => sessionOption ?? REAL_SESSION;

  const client = new OpenAiRealtimeAssistantClient({
    createSession,
    createPeerConnection: () => pc as unknown as RTCPeerConnection,
  });

  return {
    client,
    pc,
    events,
    track,
    fetchMock,
    start: () =>
      client.start({
        locale: 'en',
        stream: makeStream(track),
        onEvent: (event) => events.push(event),
      }),
  };
}

describe('OpenAiRealtimeAssistantClient', () => {
  it('claims to be a demo until a session the API calls real has been minted', async () => {
    const { client, start } = setup();
    // Before start there is nothing to justify dropping the badge. This
    // direction of failure is deliberate: a scripted assistant with no badge
    // over a live camera reads as real vision, which is the one lie the
    // feature must not tell.
    expect(client.isMock).toBe(true);
    await start();
    expect(client.isMock).toBe(false);
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
    const { pc, start } = setup();
    await start();
    expect(pc.channelLabel).toBe('oai-events');
  });

  it('publishes the microphone but never the camera', async () => {
    const { pc, start } = setup();
    await start();
    // A speech-to-speech model gains nothing from a video track, and adding one
    // would ship the user's kitchen to the provider unannounced.
    expect(pc.tracks).toHaveLength(1);
    expect(pc.tracks[0]!.kind).toBe('audio');
  });

  it('POSTs the SDP offer to the session callsUrl bearing the ephemeral secret', async () => {
    const { fetchMock, pc, start } = setup();
    await start();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(REAL_SESSION.callsUrl);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ek_live');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/sdp');
    expect(init.body).toBe('v=0 offer');
    expect(pc.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' });
  });

  it('goes live only when the channel opens, not when start() returns', async () => {
    const { pc, events, start } = setup();
    await start();
    expect(events.some((event) => event.type === 'status' && event.status === 'live')).toBe(false);

    pc.channel.emit('open', {});
    expect(events.some((event) => event.type === 'status' && event.status === 'live')).toBe(true);
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

  it('ends the session when the SDP exchange is rejected', async () => {
    const { events, start, track } = setup({ sdpStatus: 500 });
    await start();

    expect(events.some((e) => e.type === 'error' && e.code === 'assistant.connectFailed')).toBe(
      true,
    );
    expect(events.at(-1)).toEqual({ type: 'status', status: 'ended' });
    // A half-open connection would leave the mic light on after a failure.
    expect(track.stop).toHaveBeenCalled();
  });

  it('maps assistant and user transcripts onto the port events', async () => {
    const { pc, events, start } = setup();
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
  });

  it('drives the speaking state from the output audio buffer, not the transcript', async () => {
    const { pc, events, start } = setup();
    await start();

    pc.channel.message({ type: 'output_audio_buffer.started' });
    pc.channel.message({
      type: 'response.output_audio_transcript.done',
      transcript: 'You have tomatoes',
      item_id: 'a1',
    });
    pc.channel.message({ type: 'output_audio_buffer.stopped' });

    // The interleaving is the assertion, not the two speaking events on their
    // own: the transcript has to land *between* them and still be delivered as
    // a transcript. Reading the state off the transcript instead would produce
    // the same pair of speaking events — that is exactly how a transcript-driven
    // indicator hides — but the caption would go missing, and it would light up
    // late and go out while the voice was still playing.
    expect(
      events
        .filter((event) => event.type === 'speaking' || event.type === 'transcript')
        .map((event) =>
          event.type === 'speaking' ? `speaking:${event.speaking}` : `caption:${event.turn.text}`,
        ),
    ).toEqual(['speaking:true', 'caption:You have tomatoes', 'speaking:false']);
  });

  it('clears the speaking state when the user talks over the assistant', async () => {
    const { pc, events, start } = setup();
    await start();

    pc.channel.message({ type: 'output_audio_buffer.started' });
    // Barging in discards the queued audio: this is the event that fires, and
    // no `stopped` follows it.
    pc.channel.message({ type: 'output_audio_buffer.cleared' });

    expect(events.at(-1)).toEqual({ type: 'speaking', speaking: false });
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
    const { pc, events, start } = setup();
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
  });

  it('accepts the exact arguments a live gpt-realtime session produced', async () => {
    // Captured from a real session on 2026-08-27 (model gpt-realtime, our own
    // REPORT_ITEMS_TOOL definition), byte for byte including the stray padding
    // the model wrapped the JSON in. Every other payload in this file is one we
    // invented, so this is the only evidence that what the provider actually
    // emits survives our parser.
    const LIVE_ARGS =
      '{  \n  "items": [\n    {\n      "nameEn": "tomato",\n      "nameAr": "طماطم",\n' +
      '      "quantity": 3,\n      "unit": "piece",\n      "confidence": 0.99,\n' +
      '      "category": "vegetable"\n    },\n    {\n      "nameEn": "rice",\n' +
      '      "nameAr": "أرز",\n      "quantity": 2,\n      "unit": "kg",\n' +
      '      "confidence": 0.99,\n      "category": "grain"\n    }\n  ]\n}  \n';

    const { pc, events, start } = setup();
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
  });

  it('drops a report whose items do not validate, rather than coercing them', async () => {
    const { pc, events, start } = setup();
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
  });

  it('ignores malformed channel traffic instead of throwing', async () => {
    const { pc, events, start } = setup();
    await start();
    const before = events.length;

    pc.channel.emit('message', { data: 'not json' });
    pc.channel.message({ type: 'something.unknown' });

    expect(events).toHaveLength(before);
  });

  it('reports a provider error event', async () => {
    const { pc, events, start } = setup();
    await start();
    pc.channel.message({ type: 'error', error: { message: 'rate limited' } });
    expect(events.some((e) => e.type === 'error' && e.code === 'assistant.providerError')).toBe(
      true,
    );
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

    // Closing the peer connection alone leaves the browser recording indicator
    // lit; the sender track has to be stopped.
    expect(track.stop).toHaveBeenCalled();
    expect(pc.closed).toBe(true);
    expect(pc.channel.closed).toBe(true);
  });

  it('is idempotent on stop', async () => {
    const { client, start } = setup();
    await start();
    await client.stop();
    await expect(client.stop()).resolves.toBeUndefined();
  });
});
