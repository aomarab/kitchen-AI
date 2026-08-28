import type { Locale } from '@kitchen/i18n';
import type {
  AssistantEvent,
  DetectedItem,
  RealtimeAssistantClient,
  StartAssistantOptions,
} from './realtime-port';

/**
 * The offline mobile assistant. It replays the approved prototype session — a
 * spoken question, a spoken answer and the items it "sees" — on timers, so the
 * whole live experience runs with no provider, no key and no network, the same
 * way the rest of the mobile app runs on mocks.
 *
 * It is a behaviour-for-behaviour twin of the web mock
 * (`apps/web/src/lib/assistant/mock-realtime.ts`); it exists separately only
 * because React Native and the browser share no realtime transport. It is
 * honest only because `isMock` is `true`: the UI shows a persistent demo badge,
 * so a scripted answer over a real camera is never mistaken for live vision.
 * Every timer it starts is released by {@link stop}, which is what keeps a
 * "demo" from firing a caption after the user has hung up.
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

/**
 * The reply the scripted assistant gives to a typed or spoken message — the
 * text/voice half of the demo. A behaviour-for-behaviour twin of the web mock's
 * `REPLIES`: intentionally shallow canned answers keyed off obvious intent,
 * because the demo badge is lit and nothing here is real reasoning. Bilingual,
 * so an Arabic session is answered natively rather than translated.
 */
const REPLIES: Record<
  Locale,
  { recipe: string; shopping: string; expiry: string; greet: string; generic: string }
> = {
  en: {
    recipe: 'A quick tomato omelette would work well with what you have — want the steps?',
    shopping: "I can add what's missing to your shopping list. Want me to?",
    expiry: 'Keep an eye on the milk — it is closest to its date, so use it first.',
    greet:
      'Hi! I can suggest a recipe, build a shopping list, or tell you what is expiring. What would help?',
    generic:
      'Got it. I can suggest a recipe, build a shopping list, or check what is expiring — what would help?',
  },
  ar: {
    recipe: 'أقدر أعمل لك عجّة بالطماطم بسرعة من اللي عندك — تحب أعطيك الخطوات؟',
    shopping: 'أقدر أضيف الناقص إلى قائمة التسوق. تحب أسوّي هيك؟',
    expiry: 'انتبه للحليب — هو الأقرب لتاريخ انتهائه، فاستخدمه أولًا.',
    greet: 'مرحبًا! أقدر أقترح وصفة، أو أجهّز قائمة تسوّق، أو أخبرك بما قرب ينتهي. شو يساعدك؟',
    generic: 'تمام. أقدر أقترح وصفة، أو أجهّز قائمة تسوّق، أو أتحقق مما قرب ينتهي — شو يساعدك؟',
  },
};

/** Maps a message to one of the canned replies by obvious keyword intent. */
function replyFor(locale: Locale, text: string): string {
  const table = REPLIES[locale];
  if (/recipe|cook|make|dinner|lunch|breakfast|طبخ|وصفة|أطبخ|عشاء|غداء|فطور/i.test(text))
    return table.recipe;
  if (/buy|shop|store|need|missing|تسوق|اشتري|أشتري|ناقص|أحتاج/i.test(text)) return table.shopping;
  if (/expire|expiry|expiring|old|going bad|تنتهي|انتهاء|خرب|قديم/i.test(text)) return table.expiry;
  return table.generic;
}

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
  /** See {@link stop}: a demo must not be left frozen mid-sentence either. */
  private emit: ((event: AssistantEvent) => void) | null = null;
  private speaking = false;
  /** Locale of the running session, so typed replies match the spoken ones. */
  private locale: Locale = 'en';
  /** Monotonic turn id source, so every reply gets a unique key. */
  private idSeq = 0;

  constructor(private readonly options: MockRealtimeOptions = {}) {}

  async start({ locale, camera, onEvent }: StartAssistantOptions): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.ended = false;
    this.emit = onEvent;
    this.speaking = false;
    this.locale = locale;

    const connectMs = this.options.connectMs ?? 400;
    const stepMs = this.options.stepMs ?? 1400;
    const script = SCRIPT[locale];

    onEvent({ type: 'status', status: 'connecting' });

    // The opening beats depend on whether a camera is being shared. With one,
    // the demo replays the approved vision session (a spoken question, the
    // items it "sees", a spoken answer). Without one — a voice- or text-only
    // conversation — there is nothing to see, so it connects and greets instead
    // of inventing a question the user never asked or items it cannot see.
    // `undefined` keeps the original camera-only screen's behaviour.
    const hasCamera = camera !== false;

    // A script of beats at increasing offsets. Each is a tracked timer so
    // stop() can cancel any that have not fired yet.
    //
    // The speaking beats bracket the assistant's line rather than coinciding
    // with it, which is the shape of real speech: the voice starts before the
    // transcript is final and is still playing after it. Getting this ordering
    // wrong in the demo would make the indicator look correct here and wrong
    // against the live provider.
    const beats: { at: number; event: AssistantEvent }[] = hasCamera
      ? [
          { at: connectMs, event: { type: 'status', status: 'live' } },
          {
            at: connectMs + stepMs,
            event: { type: 'transcript', turn: { id: 'u1', role: 'user', text: script.user } },
          },
          {
            at: connectMs + stepMs * 2,
            event: { type: 'detections', items: SAMPLE_DETECTIONS },
          },
          { at: connectMs + stepMs * 2.5, event: { type: 'speaking', speaking: true } },
          {
            at: connectMs + stepMs * 3,
            event: {
              type: 'transcript',
              turn: { id: 'a1', role: 'assistant', text: script.assistant },
            },
          },
          { at: connectMs + stepMs * 4, event: { type: 'speaking', speaking: false } },
        ]
      : [
          { at: connectMs, event: { type: 'status', status: 'live' } },
          { at: connectMs + stepMs, event: { type: 'speaking', speaking: true } },
          {
            at: connectMs + stepMs * 1.5,
            event: {
              type: 'transcript',
              turn: { id: 'a1', role: 'assistant', text: REPLIES[locale].greet },
            },
          },
          { at: connectMs + stepMs * 2.5, event: { type: 'speaking', speaking: false } },
        ];

    // Cancelling these timers is the *only* thing that stops a scripted beat
    // firing after the user hangs up. There is deliberately no second guard
    // inside the callback: if the clear in stop() ever regresses, the test that
    // advances time past a cancelled beat must be able to see the stray event.
    for (const beat of beats) {
      this.timers.push(
        setTimeout(() => {
          if (beat.event.type === 'speaking') this.speaking = beat.event.speaking;
          onEvent(beat.event);
        }, beat.at),
      );
    }
  }

  /**
   * Answer a typed (or transcribed) message. The user's turn is echoed back
   * immediately so the chat reads naturally, and the canned reply follows,
   * bracketed by the speaking indicator exactly as the spoken script is — the
   * demo must behave the same whether the user talked or typed. A no-op before
   * start or after stop, and blank input is dropped rather than posted.
   */
  sendText(text: string): void {
    const emit = this.emit;
    if (!this.started || this.ended || !emit) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const stepMs = this.options.stepMs ?? 1400;
    emit({
      type: 'transcript',
      turn: { id: `u${++this.idSeq}`, role: 'user', text: trimmed },
    });
    const reply = replyFor(this.locale, trimmed);
    this.timers.push(
      setTimeout(() => {
        this.speaking = true;
        emit({ type: 'speaking', speaking: true });
      }, stepMs * 0.3),
    );
    this.timers.push(
      setTimeout(() => {
        emit({
          type: 'transcript',
          turn: { id: `a${++this.idSeq}`, role: 'assistant', text: reply },
        });
      }, stepMs * 0.6),
    );
    this.timers.push(
      setTimeout(() => {
        this.speaking = false;
        emit({ type: 'speaking', speaking: false });
      }, stepMs * 1.2),
    );
  }

  async stop(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.started = false;

    // Hanging up mid-line cancels the beat that would have turned the indicator
    // off, so it is turned off here instead.
    if (this.speaking) {
      this.speaking = false;
      this.emit?.({ type: 'speaking', speaking: false });
    }
    this.emit = null;
  }
}

/** The sample detections, exported for the confirm-before-write mapping. */
export { SAMPLE_DETECTIONS };
