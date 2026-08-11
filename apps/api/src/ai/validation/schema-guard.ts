import type { z } from 'zod';
import { AppError } from '../../common/errors.js';
import type {
  AiProvider,
  StructuredRequest,
  TokenUsage,
} from '../providers/ai-provider.interface.js';
import type { AiSpend } from '../ai-spend.js';
import { addUsage, attachSpend, readSpend } from '../ai-spend.js';

export interface GuardedResult<T> {
  data: T;
  /** Token usage summed across the initial call and any repair attempt. */
  usage: TokenUsage;
  model: string;
  /** 1 = valid first time, 2 = valid after one repair. */
  attempts: number;
  /** Billed attempts that produced no usable answer. See StructuredResponse. */
  priorAttempts?: AiSpend[];
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
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<GuardedResult<T>> {
    const first = await provider.complete(request);
    const firstParse = schema.safeParse(first.raw);
    if (firstParse.success) {
      return {
        data: firstParse.data,
        usage: first.usage,
        model: first.model,
        attempts: 1,
        priorAttempts: first.priorAttempts,
      };
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

    // The first call is already billed. If the repair itself throws, its error
    // must carry both calls' spend or the first one is lost.
    let second;
    try {
      second = await provider.complete(repairRequest);
    } catch (error) {
      const repairSpend = readSpend(error);
      throw attachSpend(error as object, {
        usage: repairSpend ? addUsage(first.usage, repairSpend.usage) : first.usage,
        model: repairSpend?.model ?? first.model,
      });
    }

    const secondParse = schema.safeParse(second.raw);
    const usage = addUsage(first.usage, second.usage);

    if (secondParse.success) {
      const priorAttempts = [...(first.priorAttempts ?? []), ...(second.priorAttempts ?? [])];
      return {
        data: secondParse.data,
        usage,
        model: second.model,
        attempts: 2,
        ...(priorAttempts.length > 0 ? { priorAttempts } : {}),
      };
    }

    // Two full-priced calls have been made and neither produced usable output.
    // That is the most expensive outcome there is; it must still be billed.
    throw attachSpend(
      new AppError('AI_INVALID_OUTPUT', 'errors.AI_INVALID_OUTPUT', {
        operation: request.operation,
        issues: secondParse.error.issues.slice(0, 8).map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      }),
      { usage, model: second.model },
    );
  }
}
