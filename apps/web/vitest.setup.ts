import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './src/mocks/server';
import { seed } from './src/mocks/db';
import { setMockLocale } from './src/mocks/runtime';

// Route every request through the contract-derived MSW handlers, and reset the
// seeded database between tests so each one starts from a known kitchen.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  seed();
  setMockLocale('en');
});
afterAll(() => server.close());
