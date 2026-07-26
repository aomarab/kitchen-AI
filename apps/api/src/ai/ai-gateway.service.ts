import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { AI_PROVIDER, OPERATION_TIER, type AiOperation } from './ai.constants.js';
import type { AiProvider, ImageInput } from './providers/ai-provider.interface.js';
import type { BuiltPrompt } from './prompts/prompt.shared.js';
import { SchemaGuard } from './validation/schema-guard.js';
import { BudgetService } from './usage/budget.service.js';
import { readSpend } from './ai-spend.js';

export interface ExecuteInput<T> {
  householdId: string;
  operation: AiOperation;
  prompt: BuiltPrompt;
  schema: z.ZodType<T>;
  /** Structured hints for the mock provider; ignored by the real provider. */
  context?: unknown;
  images?: ImageInput[];
  scenario?: string;
}

/**
 * The single choke-point for an AI operation. It enforces the budget before the
 * call, runs the schema-guarded provider call (with one repair retry), and
 * records usage after. Every AI-consuming service goes through here, so cost
 * control and output validation cannot be bypassed. See spec §5.6 and §8.
 */
@Injectable()
export class AiGateway {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @Inject(SchemaGuard) private readonly guard: SchemaGuard,
    @Inject(BudgetService) private readonly budget: BudgetService,
  ) {}

  async execute<T>(input: ExecuteInput<T>): Promise<T> {
    await this.budget.assertWithinBudget(input.householdId);

    const tier = OPERATION_TIER[input.operation];
    let result;
    try {
      result = await this.guard.run(
        this.provider,
        {
          operation: input.operation,
          tier,
          system: input.prompt.system,
          user: input.prompt.user,
          images: input.images,
          context: input.context,
          scenario: input.scenario,
        },
        input.schema,
      );
    } catch (error) {
      // A failed call is still a billed call. Record before rethrowing, or a
      // household that reliably fails never counts against its own daily cap.
      const spend = readSpend(error);
      if (spend) {
        await this.budget
          .record({
            householdId: input.householdId,
            model: spend.model,
            operation: input.operation,
            tier,
            usage: spend.usage,
          })
          .catch(() => undefined);
      }
      throw error;
    }

    await this.budget.record({
      householdId: input.householdId,
      model: result.model,
      operation: input.operation,
      tier,
      usage: result.usage,
    });

    return result.data;
  }
}
