import {
  errorEnvelopeSchema,
  type ErrorCode,
  type ErrorEnvelope,
  type TokenPair,
} from '@kitchen/contracts';

/**
 * Every failed API call surfaces as this. `messageKey` is an i18n key — render
 * it through `@kitchen/i18n`, never display it raw. See spec §8.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(`${envelope.code} (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.messageKey = envelope.messageKey;
    this.details = envelope.details;
  }

  get isAuthError(): boolean {
    return this.code === 'UNAUTHENTICATED';
  }

  get isRetryable(): boolean {
    return (
      this.code === 'RATE_LIMITED' ||
      this.code === 'AI_UNAVAILABLE' ||
      this.code === 'EXTERNAL_SERVICE_ERROR' ||
      this.status >= 500
    );
  }
}

/** Thrown when the request never reached the server (offline, DNS, timeout). */
export class NetworkError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Thrown when the client gave up waiting rather than the connection failing.
 *
 * A subclass of `NetworkError` so existing handling (retry, keep the offline
 * queue intact) still applies, but distinguishable because the two need
 * different words: a timeout on a slow AI call is not "you are offline", and
 * telling the user to check their connection sends them to fix the wrong thing
 * — the request usually reached the server and completed there.
 */
export class TimeoutError extends NetworkError {
  constructor(
    message: string,
    readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Thrown when the server responded but the payload did not match the contract. */
export class ContractViolationError extends Error {
  readonly issues: unknown;

  constructor(route: string, issues: unknown) {
    super(`Response for "${route}" does not match the contract`);
    this.name = 'ContractViolationError';
    this.issues = issues;
  }
}

export function parseErrorBody(status: number, body: unknown): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (parsed.success) return new ApiError(status, parsed.data);

  const fallbackCode: ErrorCode =
    status === 401
      ? 'UNAUTHENTICATED'
      : status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'NOT_FOUND'
          : status === 429
            ? 'RATE_LIMITED'
            : 'INTERNAL_ERROR';

  return new ApiError(status, {
    code: fallbackCode,
    messageKey: `errors.${fallbackCode}`,
  });
}

export interface TokenStore {
  get(): TokenPair | null | Promise<TokenPair | null>;
  set(tokens: TokenPair | null): void | Promise<void>;
}

/** In-memory token store. Web and mobile supply persistent implementations. */
export function createMemoryTokenStore(initial: TokenPair | null = null): TokenStore {
  let tokens = initial;
  return {
    get: () => tokens,
    set: (next) => {
      tokens = next;
    },
  };
}
