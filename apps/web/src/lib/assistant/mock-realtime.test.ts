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

  it('replays connecting → live → user turn → detections → assistant caption in order', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    await client.start({ locale: 'en', stream: null, onEvent });
    expect(events).toEqual([{ type: 'status', status: 'connecting' }]);

    await vi.advanceTimersByTimeAsync(500);

    const types = events.map((e) => e.type);
    expect(types).toEqual(['status', 'status', 'transcript', 'detections', 'transcript']);
    expect(events[1]).toEqual({ type: 'status', status: 'live' });
    const detections = events.find((e) => e.type === 'detections');
    expect(detections?.type === 'detections' && detections.items.map((i) => i.nameEn)).toEqual([
      'Tomato',
      'Milk',
      'Eggs',
    ]);
    const caption = events.at(-1);
    expect(caption?.type === 'transcript' && caption.turn.role).toBe('assistant');
  });

  it('authors the script natively in Arabic', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 10, stepMs: 10 });
    const { events, onEvent } = collect();
    await client.start({ locale: 'ar', stream: null, onEvent });
    await vi.advanceTimersByTimeAsync(100);
    const assistant = events.find((e) => e.type === 'transcript' && e.turn.role === 'assistant');
    expect(assistant?.type === 'transcript' && assistant.turn.text).toContain('طماطم');
  });

  it('fires no scripted beat after stop() — the hang-up cancels pending timers', async () => {
    const client = new MockRealtimeAssistantClient({ connectMs: 100, stepMs: 100 });
    const { events, onEvent } = collect();

    await client.start({ locale: 'en', stream: null, onEvent });
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
    await client.start({ locale: 'en', stream: null, onEvent });
    await client.stop();
    await expect(client.stop()).resolves.toBeUndefined();
  });
});
