import OpenAI from 'openai';
import { AppError } from '../../common/errors.js';
import type { AiProvider, StructuredRequest, StructuredResponse } from './ai-provider.interface.js';
import {
  PROVIDER_MAX_OUTPUT_TOKENS,
  PROVIDER_MAX_RETRIES,
  PROVIDER_REASONING_EFFORT,
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

/**
 * Maps an SDK failure onto the error vocabulary the rest of the app speaks.
 * Anything that is not a recognisable API status is a transport problem.
 */
export function toProviderError(error: unknown, operation: string, model: string): unknown {
  if (error instanceof AppError) return error;
  const status = (error as { status?: number }).status;
  const name = (error as { name?: string }).name ?? 'Error';
  const message = (error as { message?: string }).message ?? String(error);

  if (status === 429) {
    return new AppError('RATE_LIMITED', 'errors.RATE_LIMITED', {
      operation,
      model,
      provider: true,
    });
  }
  if (status != null && status >= 400 && status < 500) {
    // A rejected request shape (a bad parameter, an unsupported model) is our
    // bug, not an outage — surface it as such so it is not silently retried.
    return new AppError('EXTERNAL_SERVICE_ERROR', 'errors.EXTERNAL_SERVICE_ERROR', {
      operation,
      model,
      status,
      reason: message,
    });
  }
  return new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', {
    operation,
    model,
    reason: `${name}: ${message}`,
  });
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
    options: { baseURL?: string } = {},
  ) {
    const baseURL = options.baseURL?.trim() || undefined;
    this.client = new OpenAI({
      apiKey,
      // Empty => OpenAI's own endpoint; set to an OpenAI-compatible gateway
      // (e.g. OpenRouter) to serve the same chat tiers through it. See env.ts.
      baseURL,
      // OpenRouter uses these for attribution/rankings; harmless on OpenAI.
      defaultHeaders: baseURL
        ? { 'HTTP-Referer': 'https://mamas-kitchen.app', 'X-Title': "Mama's Kitchen" }
        : undefined,
      // Per-call overrides below narrow this further; this is the ceiling.
      timeout: Math.max(...Object.values(PROVIDER_TIMEOUT_MS)),
      maxRetries: Math.max(...Object.values(PROVIDER_MAX_RETRIES)),
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
    // Only the reasoning models accept this, and the others 400 on it.
    const reasoningEffort = usesMaxCompletionTokens(model)
      ? PROVIDER_REASONING_EFFORT[request.tier]
      : undefined;
    let completion;
    try {
      completion = await this.client.chat.completions.create(
        {
          model,
          messages,
          response_format: { type: 'json_object' },
          ...(usesMaxCompletionTokens(model)
            ? { max_completion_tokens: maxOutputTokens }
            : { max_tokens: maxOutputTokens }),
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        },
        {
          timeout: PROVIDER_TIMEOUT_MS[request.tier],
          maxRetries: PROVIDER_MAX_RETRIES[request.tier],
        },
      );
    } catch (error) {
      // Left raw, an SDK timeout reaches the job store as INTERNAL_ERROR — a
      // 500 that tells the client nothing and the operator less. Transport
      // failures are AI_UNAVAILABLE (503): the model did not answer, which is
      // a different thing from answering unusably.
      throw toProviderError(error, request.operation, model);
    }

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
