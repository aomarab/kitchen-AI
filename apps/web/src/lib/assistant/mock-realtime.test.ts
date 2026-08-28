import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockRealtimeAssistantClient } from './mock-realtime';
import type { AssistantEvent } from './realtime-port';

describe('MockRealtimeAssistantClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function collect() {
    const events: AssistantEvent[] = [];
    return { events, onEvent: (event: AssistantEvent) => events.push(event) };
  }

  /** A stream that reports a video track, so the vision script plays. */
  function cameraStream(): MediaStream {
    return { getVideoTracks: () => [{ kind: 'video' }] } as unknown as MediaStream;
  }

  it('replays connecting → live → user turn → detections → assistant caption in order', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    await client.start({ locale: 'en', stream: cameraStream(), onEvent });
    expect(events).toEqual([{ type: 'status', status: 'connecting' }]);

    await vi.advanceTimersByTimeAsync(500);

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'status',
      'status',
      'transcript',
      'detections',
      'speaking',
      'transcript',
      'speaking',
    ]);
    expect(events[1]).toEqual({ type: 'status', status: 'live' });
    const detections = events.find((e) => e.type === 'detections');
    expect(detections?.type === 'detections' && detections.items.map((i) => i.nameEn)).toEqual([
      'Tomato',
      'Milk',
      'Eggs',
    ]);
    const caption = events.at(-2);
    expect(caption?.type === 'transcript' && caption.turn.role).toBe('assistant');
  });

  it('authors the script natively in Arabic', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 10, stepMs: 10 });
    const { events, onEvent } = collect();
    await client.start({ locale: 'ar', stream: cameraStream(), onEvent });
    await vi.advanceTimersByTimeAsync(100);
    const assistant = events.find((e) => e.type === 'transcript' && e.turn.role === 'assistant');
    expect(assistant?.type === 'transcript' && assistant.turn.text).toContain('طماطم');
  });

  it('brackets the assistant line with speaking on and off', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    await client.start({ locale: 'en', stream: cameraStream(), onEvent });
    await vi.advanceTimersByTimeAsync(1000);

    const order = events
      .filter(
        (e) => e.type === 'speaking' || (e.type === 'transcript' && e.turn.role === 'assistant'),
      )
      .map((e) => (e.type === 'speaking' ? `speaking:${e.speaking}` : 'assistant-line'));

    // Real speech starts before the transcript is final and is still playing
    // after it. A demo that flipped the indicator on *with* the caption would
    // look right here and be wrong against the live provider.
    expect(order).toEqual(['speaking:true', 'assistant-line', 'speaking:false']);
  });

  it('puts the speaking indicator out when the user hangs up mid-sentence', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    await client.start({ locale: 'en', stream: cameraStream(), onEvent });
    // Past 'speaking: true' (350ms) but before the beat that turns it off (500ms).
    await vi.advanceTimersByTimeAsync(380);
    expect(events.at(-1)).toEqual({ type: 'speaking', speaking: true });

    await client.stop();
    // stop() cancels the beat that would have cleared it, so stop() must clear
    // it itself — otherwise the badge is frozen mid-word on the way out.
    expect(events.at(-1)).toEqual({ type: 'speaking', speaking: false });
  });

  it('does not announce a stop to speaking that never started', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    await client.start({ locale: 'en', stream: cameraStream(), onEvent });
    await vi.advanceTimersByTimeAsync(150);
    await client.stop();

    expect(events.some((e) => e.type === 'speaking')).toBe(false);
  });

  it('fires no scripted beat after stop() — the hang-up cancels pending timers', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    await client.start({ locale: 'en', stream: cameraStream(), onEvent });
    // Advance past 'live' + the user turn, but before detections/caption.
    await vi.advanceTimersByTimeAsync(250);
    const beforeStop = events.length;
    expect(events.some((e) => e.type === 'detections')).toBe(false);

    await client.stop();
    await vi.advanceTimersByTimeAsync(1000);

    // Nothing more arrives: no detections, no assistant caption, no growth.
    expect(events.length).toBe(beforeStop);
    expect(events.some((e) => e.type === 'detections')).toBe(false);
  });

  it('stop() is idempotent', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 10, stepMs: 10 });
    const { onEvent } = collect();
    await client.start({ locale: 'en', stream: cameraStream(), onEvent });
    await client.stop();
    await expect(client.stop()).resolves.toBeUndefined();
  });

  it('greets without inventing a question or detections when no camera is shared', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    // Voice/text mode: no video track in the stream.
    await client.start({ locale: 'en', stream: null, onEvent });
    await vi.advanceTimersByTimeAsync(1000);

    // No fabricated user turn and no detections when there is nothing to see.
    expect(events.some((e) => e.type === 'detections')).toBe(false);
    expect(events.some((e) => e.type === 'transcript' && e.turn.role === 'user')).toBe(false);
    const assistant = events.find((e) => e.type === 'transcript' && e.turn.role === 'assistant');
    expect(assistant?.type === 'transcript' && assistant.turn.role).toBe('assistant');
  });

  describe('sendText', () => {
    it('echoes the user message, then answers, bracketed by speaking', async () => {
      const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
      const { events, onEvent } = collect();
      await client.start({ locale: 'en', stream: null, onEvent });
      await vi.advanceTimersByTimeAsync(1000);
      const before = events.length;

      client.sendText('  what can I cook?  ');

      // The user's turn is echoed immediately and trimmed.
      const echoed = events[before];
      expect(echoed?.type === 'transcript' && echoed.turn.role).toBe('user');
      expect(echoed?.type === 'transcript' && echoed.turn.text).toBe('what can I cook?');

      await vi.advanceTimersByTimeAsync(200);
      const added = events.slice(before).map((e) => e.type);
      // user turn, then speaking:true, then the assistant reply, then speaking:false.
      expect(added).toEqual(['transcript', 'speaking', 'transcript', 'speaking']);
      const reply = events
        .slice(before)
        .filter((e) => e.type === 'transcript')
        .at(-1);
      expect(reply?.type === 'transcript' && reply.turn.role).toBe('assistant');
      // Intent-matched, not a generic fallback.
      expect(reply?.type === 'transcript' && reply.turn.text).toContain('omelette');
    });

    it('answers a typed Arabic message natively', async () => {
      const client = new MockRealtimeAssistantClient({ connectMs: 10, stepMs: 10 });
      const { events, onEvent } = collect();
      await client.start({ locale: 'ar', stream: null, onEvent });
      await vi.advanceTimersByTimeAsync(100);
      const before = events.length;

      client.sendText('شو أطبخ؟');
      await vi.advanceTimersByTimeAsync(50);
      const reply = events
        .slice(before)
        .find((e) => e.type === 'transcript' && e.turn.role === 'assistant');
      expect(reply?.type === 'transcript' && /[\u0600-\u06FF]/.test(reply.turn.text)).toBe(true);
    });

    it('is a no-op before start, on blank input, and after stop', async () => {
      const client = new MockRealtimeAssistantClient({ connectMs: 10, stepMs: 10 });
      const { events, onEvent } = collect();

      // Before start.
      client.sendText('hello');
      expect(events).toHaveLength(0);

      await client.start({ locale: 'en', stream: null, onEvent });
      await vi.advanceTimersByTimeAsync(100);
      const afterStart = events.length;

      // Blank input posts nothing.
      client.sendText('   ');
      expect(events.length).toBe(afterStart);

      // After stop, nothing is posted or scheduled.
      await client.stop();
      client.sendText('are you there?');
      await vi.advanceTimersByTimeAsync(500);
      expect(events.some((e) => e.type === 'transcript' && e.turn.text === 'are you there?')).toBe(
        false,
      );
    });
  });
});
