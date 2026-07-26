import { setupServer } from 'msw/native';
import { buildHandlers } from './handlers';

let started = false;

/**
 * Starts the MSW request interceptor for the React Native runtime. Enabled by
 * default in development; set `EXPO_PUBLIC_USE_MOCKS=false` to hit the real API
 * instead — that env flag is the only change needed to swap mocks out (see
 * `src/lib/api.ts`).
 */
export function startMockServer(baseUrl: string): void {
  if (started) return;
  const server = setupServer(...buildHandlers(baseUrl));
  server.listen({ onUnhandledRequest: 'bypass' });
  started = true;
}
