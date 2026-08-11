import type { ModelTier } from '../ai.constants.js';
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

  constructor(private readonly bindings: TierBindings) {}

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    return this.bindings[request.tier].complete(request);
  }
}
