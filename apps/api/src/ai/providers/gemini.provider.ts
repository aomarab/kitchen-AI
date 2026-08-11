import { FinishReason, GoogleGenAI } from '@google/genai';
import { AppError } from '../../common/errors.js';
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from './ai-provider.interface.js';
import { PROVIDER_MAX_OUTPUT_TOKENS, PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from '../ai.constants.js';
import { attachSpend } from '../ai-spend.js';
import { toProviderError } from './openai.provider.js';

export interface GeminiModels {
  vision: string;
}

/**
 * Gemini adapter, deliberately as thin as the OpenAI one: build the request,
 * ask for JSON, parse it, report usage. Validation belongs to the SchemaGuard.
 *
 * Bound to the vision tier only (spec: model routing). The cheap tier is at
 * price parity with OpenAI and would buy a second failure surface for nothing,
 * and planning keeps its frontier model.
 */
export class GeminiProvider implements AiProvider {
  readonly kind = 'gemini' as const;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly models: GeminiModels,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const model = this.models.vision;

    const parts: Array<Record<string, unknown>> = [{ text: request.user }];
    for (const image of request.images ?? []) {
      // The URL is a presigned GET; Gemini takes bytes, not a URL, so fetch it.
      const response = await fetch(image.url);
      const bytes = Buffer.from(await response.arrayBuffer());
      parts.push({
        inlineData: {
          mimeType: response.headers.get('content-type') ?? 'image/jpeg',
          data: bytes.toString('base64'),
        },
      });
    }

    if (request.repairOf) {
      parts.push({
        text:
          'Your previous response failed validation with error: ' +
          `${request.repairOf.error}\nPrevious output was:\n` +
          `${JSON.stringify(request.repairOf.previousRaw)}\n` +
          'Return corrected JSON that satisfies the required shape. JSON only.',
      });
    }

    let response;
    try {
      response = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: request.system,
          responseMimeType: 'application/json',
          maxOutputTokens: PROVIDER_MAX_OUTPUT_TOKENS[request.tier],
          abortSignal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS[request.tier]),
          httpOptions: {
            // SDK counts total attempts (original + retries); PROVIDER_MAX_RETRIES
            // counts only retries, matching OpenAI's maxRetries convention.
            retryOptions: { attempts: PROVIDER_MAX_RETRIES[request.tier] + 1 },
          },
        },
      });
    } catch (error) {
      throw toProviderError(error, request.operation, model);
    }

    const meta = response.usageMetadata ?? {};
    const usage = {
      inputTokens: meta.promptTokenCount ?? 0,
      // Thinking tokens are billed as output but reported separately. Leaving
      // them out undercosts every call, in the direction that costs us money.
      outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
    };

    // Mirror the OpenAI guard: a truncated response parses to partial JSON,
    // which fails validation and triggers a repair — against the same ceiling,
    // guaranteed to truncate again. Two full-priced calls, both wasted. Fail
    // fast so RoutedAiProvider can fall back to OpenAI and bill this attempt.
    if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
      throw attachSpend(
        new AppError('AI_INVALID_OUTPUT', 'errors.AI_INVALID_OUTPUT', {
          operation: request.operation,
          reason: 'truncated',
          maxTokens: PROVIDER_MAX_OUTPUT_TOKENS[request.tier],
        }),
        { usage, model },
      );
    }

    return { raw: this.parse(response.text ?? '{}'), usage, model };
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
