import type { ModelTier } from '../ai.constants.js';
import { readSpend } from '../ai-spend.js';
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from './ai-provider.interface.js';

export type TierBindings = Record<ModelTier, AiProvider>;

/**
 * Dispatches a call to the provider bound to its tier.
 *
 * This exists so a second vendor can be introduced without touching anything
 * that consumes AI: it registers under the same AI_PROVIDER token, and
 * `StructuredRequest` already carries the tier, so AiGateway, SchemaGuard and
 * every service stay exactly as they were.
 */
export class RoutedAiProvider implements AiProvider {
  readonly kind = 'routed' as const;

  constructor(
    private readonly bindings: TierBindings,
    /** Only the vision tier is configured with one. Exactly one hop, never a chain. */
    private readonly fallbacks: Partial<Record<ModelTier, AiProvider>> = {},
  ) {}

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const primary = this.bindings[request.tier];
    const fallback = this.fallbacks[request.tier];

    if (!fallback) return primary.complete(request);

    try {
      return await primary.complete(request);
    } catch (error) {
      // A failed attempt may still have been billed; carry it so the gateway
      // can record it against its own model's rate.
      const spend = readSpend(error);
      const response = await fallback.complete(request);
      return spend ? { ...response, priorAttempts: [spend] } : response;
    }
  }
}
