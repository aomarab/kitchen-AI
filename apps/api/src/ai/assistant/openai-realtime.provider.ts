import type {
  AssistantDialect,
  AssistantPersona,
  AssistantTone,
  Locale,
  RealtimeSession,
} from '@kitchen/contracts';
import {
  ASSISTANT_PERSONAS,
  REALTIME_SECRET_TTL_MAX_SEC,
  REALTIME_SECRET_TTL_MIN_SEC,
  REALTIME_SECRET_TTL_SEC,
  ingredientCategorySchema,
  unitSchema,
} from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import type { RealtimeSessionProvider } from './realtime-provider.interface.js';

/**
 * OpenAI Realtime adapter (spec Feature 5, Phase B).
 *
 * Exchanges our standard API key for an ephemeral client secret via
 * `POST /v1/realtime/client_secrets`. The client then POSTs its SDP offer
 * straight to {@link CALLS_URL} with that secret; our key never leaves here.
 */

const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

/** Where the browser POSTs its SDP offer. Returned to the client in the session. */
const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

/** How long we wait for the mint before giving up and refunding the spend. */
const MINT_TIMEOUT_MS = 10_000;

interface ClientSecretResponse {
  value?: string;
  expires_at?: number;
  session?: { model?: string };
}

/**
 * The assistant's brief. It is deliberately narrow: this session can look and
 * talk, and that is all. It cannot write, because a spoken "add it" must go
 * through the normal append-only inventory event path with a human confirming,
 * not through a model with a tool call.
 */
const TONE_INSTRUCTIONS: Record<Locale, Record<AssistantTone, string>> = {
  en: {
    warm: 'Speak warmly and unhurriedly, the way a friend talks someone through a recipe.',
    neutral: 'Speak calmly and evenly, and keep to the point.',
    energetic: 'Speak brightly and briskly, with energy.',
  },
  ar: {
    warm: 'تحدّثي بدفء وعلى مهلك، كما تشرح صديقة وصفةً لصديقتها.',
    neutral: 'تحدّثي بهدوء واتزان، وادخلي في صلب الموضوع.',
    energetic: 'تحدّثي بحيوية وسرعة ونشاط.',
  },
};

/**
 * Dialect steering, in Arabic only.
 *
 * There is no English half to this record and there must not be: Levantine and
 * Egyptian are varieties of Arabic, so instructing an English session to use
 * one would produce either code-switching or an invented accent. In English a
 * persona contributes its voice and tone and nothing else.
 *
 * Verified empirically rather than assumed — steering produced genuinely
 * different lexis *and* culinary reference (Levantine «يخنة … على جنب» vs
 * Egyptian «طاجن … كشري مصري»), not a relabelled default. It does **not**
 * change accent; see the spec's known limitations.
 */
const DIALECT_INSTRUCTIONS: Record<AssistantDialect, string> = {
  levantine: 'تحدّثي باللهجة الشامية الطبيعية، واستخدمي مفرداتها وأسماء أطباقها.',
  gulf: 'تحدّثي باللهجة الخليجية الطبيعية، واستخدمي مفرداتها وأسماء أطباقها.',
  egyptian: 'تحدّثي باللهجة المصرية الطبيعية، واستخدمي مفرداتها وأسماء أطباقها.',
  msa: 'تحدّثي بالعربية الفصحى الواضحة دون لهجة محلية.',
};

function personaInstructions(locale: Locale, persona: AssistantPersona): string {
  const profile = ASSISTANT_PERSONAS[persona];
  const lines = [TONE_INSTRUCTIONS[locale][profile.tone]];
  if (locale === 'ar') lines.push(DIALECT_INSTRUCTIONS[profile.dialect]);
  return lines.join(' ');
}

function instructions(locale: Locale, pantryBrief: string, persona: AssistantPersona): string {
  // The pantry goes last: it is the longest section, and the behavioural rules
  // above it are the ones that must not be crowded out.
  const role =
    locale === 'ar'
      ? [
          'أنتِ مساعدة مطبخ ترى ما تريه الكاميرا وتتحدث بالعربية المحكية الطبيعية.',
          'صِفي ما ترينه من مكوّنات بإيجاز، واقترحي ما يمكن طهيه منها.',
          'لا تدّعي أنكِ ترين شيئًا غير واضح؛ قولي إنكِ لستِ متأكدة.',
          'لا يمكنكِ تعديل المخزون بنفسك — اطلبي من المستخدم تأكيد الإضافة.',
          'استدعي report_items كلما تغيّرت الأصناف التي ترينها.',
        ].join(' ')
      : [
          'You are a kitchen assistant who can see through the camera and speaks naturally.',
          'Briefly describe the ingredients you can see and suggest what could be cooked from them.',
          'Never claim to see something you cannot make out — say you are unsure instead.',
          'You cannot change the inventory yourself — ask the user to confirm any addition.',
          'Call report_items whenever the set of items you can see changes.',
        ].join(' ');

  // Persona goes first: it governs *how* every following sentence is delivered,
  // and the pantry brief is long enough to bury a rule placed after it.
  return `${personaInstructions(locale, persona)}\n\n${role}\n\n${pantryBrief}`;
}

/**
 * The one tool the assistant gets.
 *
 * A realtime model speaks; it does not emit structured data unless asked to.
 * Without this the "what do you see" half of the feature would have to be
 * scraped out of a transcript, which is exactly the kind of guessing that
 * produces a confident wrong pantry.
 *
 * Its enums are generated from the contract schemas rather than written out,
 * so a new unit or category cannot silently become un-reportable. The client
 * re-validates every item against those same schemas — this tool definition is
 * a prompt, not a guarantee, and a model may still return nonsense.
 *
 * Note there is no `add_to_inventory` tool, and there must not be: a detection
 * is a suggestion, and the write goes through the normal append-only inventory
 * event path after a human confirms it.
 */
const REPORT_ITEMS_TOOL = {
  type: 'function',
  name: 'report_items',
  description:
    'Report the food items currently visible to the camera. Call this whenever what you can see changes. Only report items you can actually see.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['nameEn', 'nameAr', 'quantity', 'unit', 'confidence', 'category'],
          properties: {
            nameEn: { type: 'string', description: 'Item name in English.' },
            nameAr: { type: 'string', description: 'Item name in Arabic.' },
            quantity: {
              type: ['number', 'null'],
              description: 'How many/much, or null if it cannot be counted from the image.',
            },
            unit: { type: 'string', enum: [...unitSchema.options] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            category: { type: 'string', enum: [...ingredientCategorySchema.options] },
          },
        },
      },
    },
  },
} as const;

export class OpenAiRealtimeSessionProvider implements RealtimeSessionProvider {
  readonly isMock = false;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async mint(
    locale: Locale,
    pantryBrief: string,
    persona: AssistantPersona,
  ): Promise<RealtimeSession> {
    // The provider rejects anything outside its own bounds, and a rejected mint
    // is indistinguishable to the caller from an outage. Fail on our side, where
    // the message can name the real cause.
    if (
      REALTIME_SECRET_TTL_SEC < REALTIME_SECRET_TTL_MIN_SEC ||
      REALTIME_SECRET_TTL_SEC > REALTIME_SECRET_TTL_MAX_SEC
    ) {
      throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', {
        reason: 'realtime secret ttl out of provider range',
      });
    }

    const body = {
      expires_after: { anchor: 'created_at', seconds: REALTIME_SECRET_TTL_SEC },
      session: {
        type: 'realtime',
        model: this.model,
        instructions: instructions(locale, pantryBrief, persona),
        // The provider validates this against its own list and rejects an
        // unknown id with a 400 — which is why the catalog is contract.
        audio: { output: { voice: ASSISTANT_PERSONAS[persona].voice } },
        tools: [REPORT_ITEMS_TOOL],
      },
    };

    let response: Response;
    try {
      response = await fetch(CLIENT_SECRETS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
      });
    } catch {
      throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', {
        reason: 'realtime mint request failed',
      });
    }

    if (!response.ok) {
      throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', {
        reason: 'realtime mint rejected',
        status: response.status,
      });
    }

    const data = (await response.json()) as ClientSecretResponse;
    // A response that parsed but carries no secret is the dangerous case: the
    // household has already been charged, and an empty string would be returned
    // as a "session" the client cannot possibly connect with.
    if (!data.value) {
      throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', {
        reason: 'realtime mint returned no client secret',
      });
    }

    return {
      clientSecret: data.value,
      // `expires_at` is unix seconds. Falling back to our own TTL keeps the
      // contract's `isoDateTimeSchema` satisfiable if the provider omits it.
      expiresAt: new Date(
        data.expires_at ? data.expires_at * 1000 : Date.now() + REALTIME_SECRET_TTL_SEC * 1000,
      ).toISOString(),
      // Report the model the provider actually bound, not the one we asked for.
      model: data.session?.model ?? this.model,
      callsUrl: CALLS_URL,
      isMock: false,
    };
  }
}
