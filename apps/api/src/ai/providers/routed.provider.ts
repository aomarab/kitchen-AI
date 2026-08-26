import { Logger } from '@nestjs/common';
import type { ModelTier } from '../ai.constants.js';
import { attachPriorAttempts, readPriorAttempts, readSpend } from '../ai-spend.js';
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
  private readonly logger = new Logger(RoutedAiProvider.name);

  constructor(
    private readonly bindings: TierBindings,
    /** Only the vision tier is configured with one. Exactly one hop, never a chain. */
    private readonly fallbacks: Partial<Record<ModelTier, AiProvider>> = {},
  ) {}

  async complete(request: StructuredRequest): Promise<StructuredResponse> {
    const primary = this.bindings[request.tier];
    const fallback = this.fallbacks[request.tier];

    if (!fallback) return primary.complete(request);

    let primarySpend;
    try {
      return await primary.complete(request);
    } catch (primaryError) {
      // A silently-swallowed primary failure makes a broken vendor
      // indistinguishable from a working one: the fallback serves, the user
      // sees success, and the branch delivers zero savings with no error, no
      // log line and no ledger trace. Log before falling back so the outage is
      // observable. The fallback stays unconditional — exactly one hop.
      this.logger.warn(
        `vision primary "${primary.kind}" failed for ${request.operation}; ` +
          `falling back to "${fallback.kind}". reason: ${describePrimaryError(primaryError)}`,
      );
      // A failed attempt may still have been billed; carry it so the gateway
      // can record it against its own model's rate.
      primarySpend = readSpend(primaryError);
    }

    try {
      const response = await fallback.complete(request);
      return primarySpend
        ? { ...response, priorAttempts: [primarySpend, ...(response.priorAttempts ?? [])] }
        : response;
    } catch (fallbackError) {
      // The fallback also failed. Preserve the primary's spend on the
      // propagated error so the gateway can still bill it — appending to
      // whatever priorAttempts the fallback error may already carry.
      if (primarySpend && typeof fallbackError === 'object' && fallbackError !== null) {
        const existing = readPriorAttempts(fallbackError);
        attachPriorAttempts(fallbackError as object, [primarySpend, ...existing]);
      }
      throw fallbackError;
    }
  }
}

/** A compact identity for the swallowed primary error, for the fallback warn. */
function describePrimaryError(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code;
    const message = (error as { message?: string }).message;
    if (code) return message ? `${code} (${message})` : code;
    if (message) return message;
  }
  return String(error);
}
