import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ os: 'ios' as string, version: '1.2.3' as string | undefined }));

vi.mock('react-native', () => ({ Platform: { get OS() { return mocks.os; } } }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return mocks.version === undefined ? null : { version: mocks.version };
    },
  },
}));

describe('currentPlatform', () => {
  beforeEach(() => {
    mocks.os = 'ios';
    mocks.version = '1.2.3';
    vi.resetModules();
  });
  afterEach(() => vi.resetModules());

  it.each([
    ['ios', 'ios'],
    ['android', 'android'],
    ['web', 'web'],
  ])('maps Platform.OS %s to %s', async (os, expected) => {
    mocks.os = os;
    const { currentPlatform } = await import('./feedback');
    expect(currentPlatform()).toBe(expected);
  });

  it('falls back to the closest supported platform for windows/macos', async () => {
    mocks.os = 'macos';
    const { currentPlatform } = await import('./feedback');
    // The contract enum has no desktop member; web is the honest bucket.
    expect(currentPlatform()).toBe('web');
  });
});

describe('currentAppVersion', () => {
  beforeEach(() => {
    mocks.os = 'ios';
    mocks.version = '1.2.3';
    vi.resetModules();
  });

  it('reads the version from the Expo config', async () => {
    const { currentAppVersion } = await import('./feedback');
    expect(currentAppVersion()).toBe('1.2.3');
  });

  it('falls back when the config is missing, so a submission is never blocked', async () => {
    mocks.version = undefined;
    const { currentAppVersion } = await import('./feedback');
    expect(currentAppVersion()).toBe('0.0.0');
  });
});
