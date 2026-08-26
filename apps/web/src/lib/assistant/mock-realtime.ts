import type { Locale } from '@kitchen/i18n';
import type {
  AssistantEvent,
  DetectedItem,
  RealtimeAssistantClient,
  StartAssistantOptions,
} from './realtime-port';

/**
 * The offline assistant. It replays the approved prototype-06 session — a spoken
 * question, a spoken answer and the items it "sees" — on timers, so the whole
 * live experience runs with no provider, no key and no network, exactly as the
 * rest of the app runs on mocks in dev.
 *
 * It is honest only because `isMock` is `true`: the UI shows a persistent demo
 * badge, so a scripted answer over a real camera is never mistaken for live
 * vision. Every timer it starts is released by {@link stop}, which is what keeps
 * a "demo" from firing a caption after the user has hung up.
 */

/** The sample items the demo assistant reports. Bilingual for the write path. */
const SAMPLE_DETECTIONS: DetectedItem[] = [
  {
    id: 'demo-tomato',
    nameEn: 'Tomato',
    nameAr: 'طماطم',
    quantity: 4,
    unit: 'piece',
    confidence: 0.92,
    category: 'vegetable',
  },
  {
    id: 'demo-milk',
    nameEn: 'Milk',
    nameAr: 'حليب',
    quantity: 1,
    unit: 'l',
    confidence: 0.86,
    category: 'dairy',
  },
  {
    id: 'demo-eggs',
    nameEn: 'Eggs',
    nameAr: 'بيض',
    quantity: 6,
    unit: 'piece',
    confidence: 0.9,
    category: 'egg',
  },
];

const SCRIPT: Record<Locale, { user: string; assistant: string }> = {
  en: {
    user: 'What can I cook from these?',
    assistant:
      'I can see tomatoes, eggs and milk — want me to make you a tomato omelette? You have everything you need ✅',
  },
  ar: {
    user: 'شو أقدر أطبخ من هالأغراض؟',
    assistant: 'شايفة عندك طماطم وبيض وحليب — تحبّي أسوّي لك عجّة بالطماطم؟ عندك كل المكوّنات ✅',
  },
};

/** Milliseconds between scripted beats. Small so tests advance quickly. */
export interface MockRealtimeOptions {
  connectMs?: number;
  stepMs?: number;
}

export class MockRealtimeAssistantClient implements RealtimeAssistantClient {
  readonly isMock = true;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private ended = false;
  private started = false;

  constructor(private readonly options: MockRealtimeOptions = {}) {}

  async start({ locale, onEvent }: StartAssistantOptions): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.ended = false;

    const connectMs = this.options.connectMs ?? 400;
    const stepMs = this.options.stepMs ?? 1400;
    const script = SCRIPT[locale];

    onEvent({ type: 'status', status: 'connecting' });

    // A script of beats at increasing offsets. Each is a tracked timer so
    // stop() can cancel any that have not fired yet.
    const beats: { at: number; event: AssistantEvent }[] = [
      { at: connectMs, event: { type: 'status', status: 'live' } },
      {
        at: connectMs + stepMs,
        event: { type: 'transcript', turn: { id: 'u1', role: 'user', text: script.user } },
      },
      {
        at: connectMs + stepMs * 2,
        event: { type: 'detections', items: SAMPLE_DETECTIONS },
      },
      {
        at: connectMs + stepMs * 3,
        event: {
          type: 'transcript',
          turn: { id: 'a1', role: 'assistant', text: script.assistant },
        },
      },
    ];

    // Cancelling these timers is the *only* thing that stops a scripted beat
    // firing after the user hangs up. There is deliberately no second guard
    // inside the callback: if the clear in stop() ever regresses, the test that
    // advances time past a cancelled beat must be able to see the stray event.
    for (const beat of beats) {
      this.timers.push(setTimeout(() => onEvent(beat.event), beat.at));
    }
  }

  async stop(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.started = false;
  }
}

/** The sample detections, exported for the confirm-before-write mapping. */
export { SAMPLE_DETECTIONS };
