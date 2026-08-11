import type { z } from 'zod';
import { AppError } from '../../common/errors.js';
import type {
  AiProvider,
  StructuredRequest,
  TokenUsage,
} from '../providers/ai-provider.interface.js';
import type { AiSpend } from '../ai-spend.js';
import { addUsage, attachPriorAttempts, attachSpend, readPriorAttempts, readSpend } from '../ai-spend.js';

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
    // must carry both calls' spend — but only summed into one row when both
    // calls were the *same* model. When the repair failed over to a different
    // vendor (Gemini first, OpenAI repair), the two calls bill at different
    // per-token rates; summing them would price the first vendor's tokens at
    // the second's rate. So the throwing (repair) call keeps its own spend and
    // the first call is carried as a separately-keyed prior attempt.
    let second;
    try {
      second = await provider.complete(repairRequest);
    } catch (error) {
      const repairSpend = readSpend(error);
      const carried: AiSpend[] = [];
      if (!repairSpend) {
        // The repair threw before billing (e.g. a transport error). Only the
        // first call was billed; it becomes this error's own spend.
        attachSpend(error as object, { usage: first.usage, model: first.model });
      } else if (repairSpend.model === first.model) {
        // Same vendor: safe to record as a single summed row.
        attachSpend(error as object, {
          usage: addUsage(first.usage, repairSpend.usage),
          model: repairSpend.model,
        });
      } else {
        // Different vendor: keep the repair call's spend as-is, carry the first
        // call separately so it is billed at its own model's rate.
        attachSpend(error as object, repairSpend);
        carried.push({ usage: first.usage, model: first.model });
      }
      // Also forward any priorAttempts from the first call so they are not
      // silently dropped on this path.
      const prior = [
        ...(first.priorAttempts ?? []),
        ...carried,
        ...readPriorAttempts(error),
      ];
      if (prior.length > 0) attachPriorAttempts(error as object, prior);
      throw error;
    }

    const secondParse = schema.safeParse(second.raw);
    // Only sum the two calls when they were served by the same model. A
    // cross-vendor repair (Gemini → OpenAI) bills at two different rates, so
    // the first call is carried as its own prior attempt rather than summed.
    const sameModel = first.model === second.model;
    const usage = sameModel ? addUsage(first.usage, second.usage) : second.usage;
    const carried: AiSpend[] = sameModel ? [] : [{ usage: first.usage, model: first.model }];

    if (secondParse.success) {
      const priorAttempts = [
        ...(first.priorAttempts ?? []),
        ...carried,
        ...(second.priorAttempts ?? []),
      ];
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
    const finalError = attachSpend(
      new AppError('AI_INVALID_OUTPUT', 'errors.AI_INVALID_OUTPUT', {
        operation: request.operation,
        issues: secondParse.error.issues.slice(0, 8).map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      }),
      { usage, model: second.model },
    );
    const priorOnFinal = [
      ...(first.priorAttempts ?? []),
      ...carried,
      ...(second.priorAttempts ?? []),
    ];
    if (priorOnFinal.length > 0) attachPriorAttempts(finalError, priorOnFinal);
    throw finalError;
  }
}
