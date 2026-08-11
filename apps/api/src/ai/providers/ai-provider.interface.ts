import type { AiOperation, ModelTier } from '../ai.constants.js';

/**
 * The AI provider is deliberately generic: it takes a fully-formed prompt and
 * returns raw parsed JSON, which the {@link SchemaGuard} then validates. This
 * keeps prompt construction, schema validation, budgeting and usage accounting
 * out of the provider, so the real and mock implementations stay tiny and
 * interchangeable (selected by `env.AI_MOCK`). See spec §5 and §8.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** An image reference passed to a vision call. `url` is a fetchable URL. */
export interface ImageInput {
  url: string;
}

export interface StructuredRequest {
  operation: AiOperation;
  tier: ModelTier;
  /** System prompt — carries the role, rules and the active locale. */
  system: string;
  /** User prompt — the concrete task payload. */
  user: string;
  /** Images for vision operations. Ignored by text operations. */
  images?: ImageInput[];
  /**
   * Present on a repair attempt. The guard sets this after a schema failure so
   * the provider (or model) can correct its previous output. See spec §8.
   */
  repairOf?: {
    previousRaw: unknown;
    error: string;
  };
  /**
   * Deterministic fixture selector for the mock provider and for tests. Ignored
   * by the real provider. Lets a caller exercise failure paths (invalid output,
   * empty vision result) without touching the network.
   */
  scenario?: string;
  /**
   * Structured task context (locale, scope, dates, pantry names…). The real
   * provider ignores it — everything the model needs is in `system`/`user`. The
   * mock provider uses it to assemble a request-aligned, recorded fixture.
   */
  context?: unknown;
}

export interface StructuredResponse {
  /** Parsed JSON from the model, still untrusted — validate before use. */
  raw: unknown;
  usage: TokenUsage;
  /** The concrete model id that served the request. */
  model: string;
}

export interface AiProvider {
  readonly kind: 'openai' | 'gemini' | 'mock' | 'routed';
  complete(request: StructuredRequest): Promise<StructuredResponse>;
}
