import {
  HOUSEHOLD_HEADER,
  IDEMPOTENCY_HEADER,
  routes,
  tokenPairSchema,
  type RouteBody,
  type RouteDefinition,
  type RouteName,
  type RouteParams,
  type RouteQuery,
  type RouteResponse,
} from '@kitchen/contracts';
import {
  ContractViolationError,
  NetworkError,
  createMemoryTokenStore,
  parseErrorBody,
  type TokenStore,
} from './errors.js';

export * from './errors.js';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore?: TokenStore;
  /** Returns the household id sent in `x-household-id`. */
  getHouseholdId?: () => string | null | Promise<string | null>;
  /** Called after a refresh fails, so the app can sign the user out. */
  onAuthExpired?: () => void;
  fetchImpl?: typeof fetch;
  /** Milliseconds before a request is aborted. Defaults to 30s. */
  timeoutMs?: number;
  /**
   * Validate responses against the contract before returning them. On by
   * default; disable in production builds where the extra parse costs more than
   * the safety is worth.
   */
  validateResponses?: boolean;
}

export interface CallOptions<K extends RouteName> {
  params?: RouteParams<K>;
  query?: RouteQuery<K>;
  body?: RouteBody<K>;
  /** Sent as `idempotency-key`; required by job-creating routes to be safe on retry. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

type RequiredKeys<K extends RouteName> =
  | (RouteParams<K> extends never ? never : 'params')
  | (RouteQuery<K> extends never ? never : 'query')
  | (RouteBody<K> extends never ? never : 'body');

export type CallArgs<K extends RouteName> = [RequiredKeys<K>] extends [never]
  ? [options?: CallOptions<K>]
  : [options: CallOptions<K> & Required<Pick<CallOptions<K>, RequiredKeys<K>>>];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Only `/:param` segments are substituted. Anchoring on the leading slash keeps
 * custom-method paths such as `/inventory/items:bulk` intact.
 */
function buildPath(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path param "${name}" for "${template}"`);
    return `/${encodeURIComponent(value)}`;
  });
}

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, String(entry));
    } else {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * `AbortSignal.any` is not available in React Native's Hermes engine, so fall
 * back to manual forwarding.
 *
 * Returns a disposer because the fallback attaches a listener to the caller's
 * signal, which typically outlives the request. Without cleanup, a long-lived
 * signal reused across many calls would accumulate listeners.
 */
function combineSignals(
  external: AbortSignal | undefined,
  timeout: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const noop = (): void => {};
  if (!external) return { signal: timeout, dispose: noop };

  const anyFn = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return { signal: anyFn([external, timeout]), dispose: noop };

  const controller = new AbortController();
  if (external.aborted || timeout.aborted) {
    controller.abort();
    return { signal: controller.signal, dispose: noop };
  }

  const abort = (): void => controller.abort();
  external.addEventListener('abort', abort);
  timeout.addEventListener('abort', abort);

  return {
    signal: controller.signal,
    dispose: () => {
      external.removeEventListener('abort', abort);
      timeout.removeEventListener('abort', abort);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export function createApiClient(options: ApiClientOptions) {
  const {
    baseUrl,
    tokenStore = createMemoryTokenStore(),
    getHouseholdId,
    onAuthExpired,
    fetchImpl,
    timeoutMs = 30_000,
    validateResponses = true,
  } = options;

  const doFetch: typeof fetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const root = baseUrl.replace(/\/+$/, '');
  let refreshInFlight: Promise<boolean> | null = null;

  async function refreshTokens(): Promise<boolean> {
    const current = await tokenStore.get();
    if (!current?.refreshToken) return false;

    try {
      const response = await doFetch(`${root}${routes.refresh.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) return false;
      const parsed = tokenPairSchema.safeParse(await response.json());
      if (!parsed.success) return false;
      await tokenStore.set(parsed.data);
      return true;
    } catch {
      return false;
    }
  }

  async function refreshOnce(): Promise<boolean> {
    refreshInFlight ??= refreshTokens().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function send<K extends RouteName>(
    name: K,
    route: RouteDefinition,
    callOptions: CallOptions<K>,
    allowRefresh: boolean,
  ): Promise<RouteResponse<K>> {
    const path = buildPath(route.path, callOptions.params as Record<string, string> | undefined);
    const url = `${root}${path}${buildQuery(callOptions.query as Record<string, unknown> | undefined)}`;

    const headers: Record<string, string> = { accept: 'application/json' };

    if (route.auth) {
      const tokens = await tokenStore.get();
      if (tokens?.accessToken) headers.authorization = `Bearer ${tokens.accessToken}`;
    }

    if (route.household && getHouseholdId) {
      const householdId = await getHouseholdId();
      if (householdId) headers[HOUSEHOLD_HEADER] = householdId;
    }

    if (callOptions.idempotencyKey) {
      headers[IDEMPOTENCY_HEADER] = callOptions.idempotencyKey;
    }

    let payload: string | undefined;
    if (callOptions.body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(callOptions.body);
    }

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const { signal, dispose } = combineSignals(callOptions.signal, timeout.signal);

    let response: Response;
    try {
      response = await doFetch(url, { method: route.method, headers, body: payload, signal });
    } catch (cause) {
      throw new NetworkError(`Request to ${route.method} ${path} failed`, cause);
    } finally {
      clearTimeout(timer);
      dispose();
    }

    if (response.status === 401 && route.auth && allowRefresh) {
      const refreshed = await refreshOnce();
      if (refreshed) return send(name, route, callOptions, false);
      await tokenStore.set(null);
      onAuthExpired?.();
    }

    const raw = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) throw parseErrorBody(response.status, raw);

    if (!validateResponses) return raw as RouteResponse<K>;

    const parsed = route.response.safeParse(raw);
    if (!parsed.success) throw new ContractViolationError(String(name), parsed.error.issues);
    return parsed.data as RouteResponse<K>;
  }

  /**
   * Call any endpoint in the contract registry. Path params, query and body are
   * all type-checked against `routes`.
   */
  async function call<K extends RouteName>(
    name: K,
    ...args: CallArgs<K>
  ): Promise<RouteResponse<K>> {
    const route: RouteDefinition = routes[name];
    const callOptions = (args[0] ?? {}) as CallOptions<K>;
    return send(name, route, callOptions, true);
  }

  return {
    call,
    tokenStore,
    /** Exposed so apps can build absolute URLs for presigned uploads. */
    baseUrl: root,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
