import type { z } from 'zod';
import { AppError } from '../../common/errors.js';
import type {
  AiProvider,
  StructuredRequest,
  TokenUsage,
} from '../providers/ai-provider.interface.js';

export interface GuardedResult<T> {
  data: T;
  /** Token usage summed across the initial call and any repair attempt. */
  usage: TokenUsage;
  model: string;
  /** 1 = valid first time, 2 = valid after one repair. */
  attempts: number;
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * Runs a provider call and validates the raw model output against its Zod
 * schema. On the first validation failure it makes exactly one repair attempt;
 * if that also fails it throws `AI_INVALID_OUTPUT`. Raw model JSON is never
 * trusted or returned unvalidated. See spec §8.
 */
export class SchemaGuard {
  async run<T>(
    provider: AiProvider,
    request: StructuredRequest,
    schema: z.ZodType<T>,
  ): Promise<GuardedResult<T>> {
    const first = await provider.complete(request);
    const firstParse = schema.safeParse(first.raw);
    if (firstParse.success) {
      return { data: firstParse.data, usage: first.usage, model: first.model, attempts: 1 };
    }

    const repairRequest: StructuredRequest = {
      ...request,
      repairOf: {
        previousRaw: first.raw,
        error: firstParse.error.issues
          .slice(0, 8)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      },
    };

    const second = await provider.complete(repairRequest);
    const secondParse = schema.safeParse(second.raw);
    const usage = addUsage(first.usage, second.usage);

    if (secondParse.success) {
      return { data: secondParse.data, usage, model: second.model, attempts: 2 };
    }

    throw new AppError('AI_INVALID_OUTPUT', 'errors.AI_INVALID_OUTPUT', {
      operation: request.operation,
      issues: secondParse.error.issues.slice(0, 8).map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
}
