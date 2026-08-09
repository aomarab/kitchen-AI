import { defineConfig } from 'vitest/config';

/**
 * Tests target the pure logic layer only (offline queue, expiry/format helpers,
 * error mapping, capture-review guard). No native render harness — those need a
 * device runtime — so the node environment is enough.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
