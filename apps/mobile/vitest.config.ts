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
  resolve: {
    alias: {
      // expo-image-manipulator pulls in native Expo modules that cannot run in
      // the node test environment. The stub lets resizeForUpload be tested here
      // by recording the actions passed to the manipulator. Baked EXIF
      // orientation is the one behaviour that remains a device-only manual gate.
      'expo-image-manipulator': new URL(
        './src/mocks/expo-image-manipulator.ts',
        import.meta.url,
      ).pathname,
    },
  },
});
