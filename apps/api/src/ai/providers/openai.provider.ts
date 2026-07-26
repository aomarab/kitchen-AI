import OpenAI from 'openai';
import { AppError } from '../../common/errors.js';
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from './ai-provider.interface.js';
import {
  PROVIDER_MAX_OUTPUT_TOKENS,
  PROVIDER_MAX_RETRIES,
  PROVIDER_TIMEOUT_MS,
  type ModelTier,
} from '../ai.constants.js';
import { attachSpend } from '../ai-spend.js';

/**
 * The GPT-5 and o-series families removed `max_tokens` from Chat Completions
 * and reject it with a 400 that the SDK does not retry. Everything older only
 * understands `max_tokens`. The model id is configurable, so pick per call
 * rather than assuming the default.
 */
function usesMaxCompletionTokens(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model);
}

export interface OpenAiModels {
  cheap: string;
  vision: string;
  planning: string;
}

/**
 * Real OpenAI provider. Deliberately thin: it builds messages, requests a JSON
 * object response, parses it, and reports token usage. It never validates —
 * that is the {@link SchemaGuard}'s job — and never trusts the output as typed.
 * Selected only when `env.AI_MOCK` is false. See spec §5.6.
 */
export class OpenAiProvider implements AiProvider {
  readonly kind = 'openai' as const;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly models: OpenAiModels,
  ) {
    this.client = new OpenAI({
      apiKey,
      // Per-call overrides below narrow this further; this is the ceiling.
      timeout: Math.max(...Object.values(PROVIDER_TIMEOUT_MS)),
      maxRetries: PROVIDER_MAX_RETRIES,
    });
  }

  private modelFor(tier: ModelTier): string {
    return this.models[tier];
  }

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const model = this.modelFor(request.tier);

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: request.user },
    ];
    for (const image of request.images ?? []) {
      userContent.push({ type: 'image_url', image_url: { url: image.url } });
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.system },
      { role: 'user', content: userContent },
    ];

    if (request.repairOf) {
      messages.push({
        role: 'user',
        content:
          'Your previous response failed validation with error: ' +
          `${request.repairOf.error}\nPrevious output was:\n` +
          `${JSON.stringify(request.repairOf.previousRaw)}\n` +
          'Return corrected JSON that satisfies the required shape. JSON only.',
      });
    }

    const maxOutputTokens = PROVIDER_MAX_OUTPUT_TOKENS[request.tier];
    const completion = await this.client.chat.completions.create(
      {
        model,
        messages,
        response_format: { type: 'json_object' },
        ...(usesMaxCompletionTokens(model)
          ? { max_completion_tokens: maxOutputTokens }
          : { max_tokens: maxOutputTokens }),
      },
      { timeout: PROVIDER_TIMEOUT_MS[request.tier] },
    );

    const choice = completion.choices[0];
    const usage = {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };

    // A truncated completion is not a malformed one. Left alone it parses to
    // half an object, fails validation, and gets routed into the SchemaGuard's
    // repair path — which re-sends the same truncated text against the same
    // token ceiling and truncates again. Two full-priced calls, guaranteed to
    // fail. Fail on the first.
    if (choice?.finish_reason === 'length') {
      // Truncation bills the full ceiling, so the spend rides along on the
      // error for the gateway to record.
      throw attachSpend(
        new AppError('AI_INVALID_OUTPUT', 'errors.AI_INVALID_OUTPUT', {
          operation: request.operation,
          reason: 'truncated',
          maxTokens: maxOutputTokens,
        }),
        { usage, model: completion.model ?? model },
      );
    }

    const content = choice?.message?.content ?? '{}';
    const raw = this.parse(content);

    return { raw, usage, model: completion.model ?? model };
  }

  /** Parse leniently — a fenced or prefixed body should not crash the pipeline. */
  private parse(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(content.slice(start, end + 1));
        } catch {
          return { __unparseable: content };
        }
      }
      return { __unparseable: content };
    }
  }
}
