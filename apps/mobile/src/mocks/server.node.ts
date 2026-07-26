import { setupServer } from 'msw/node';
import { buildHandlers } from './handlers';

/**
 * Node MSW server for vitest. Tests import this to exercise the same
 * contract-derived handlers the app runs against.
 */
export function createTestServer(baseUrl = 'http://localhost:3333') {
  return setupServer(...buildHandlers(baseUrl));
}
