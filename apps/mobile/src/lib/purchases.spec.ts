import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ os: 'ios' as string }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platform.os;
    },
  },
}));

const SRC = join(__dirname, '..');

async function load() {
  return import('./purchases');
}

describe('activeStore', () => {
  beforeEach(() => {
    platform.os = 'ios';
    vi.resetModules();
  });
  afterEach(() => vi.resetModules());

  it('maps iOS to the Apple store', async () => {
    platform.os = 'ios';
    const { activeStore } = await load();
    expect(activeStore()).toBe('apple');
  });

  it('maps Android to the Google store', async () => {
    platform.os = 'android';
    const { activeStore } = await load();
    expect(activeStore()).toBe('google');
  });
});

describe('mockPurchases', () => {
  beforeEach(() => {
    platform.os = 'ios';
    vi.resetModules();
  });

  it('returns a receipt carrying the product id and the active store', async () => {
    platform.os = 'android';
    const { mockPurchases } = await load();
    const result = await mockPurchases.purchase('credits_300');
    expect('cancelled' in result).toBe(false);
    if ('cancelled' in result) throw new Error('unreachable');
    // A non-empty transaction id is what tells the flow the charge went through
    // rather than falling back to `pending`.
    expect(result.storeTransactionId.length).toBeGreaterThan(0);
    expect(result.storeTransactionId).toContain('credits_300');
    expect(result.store).toBe('google');
  });

  it('never touches the native module — buying resolves with no SDK loaded', async () => {
    // If `mockPurchases` reached for `react-native-purchases`, importing it here
    // (node, native module absent) would throw. Reaching this assertion proves
    // the mock path stays fully offline, which is the Expo Go safety contract.
    const { mockPurchases } = await load();
    await expect(mockPurchases.purchase('credits_300')).resolves.toBeDefined();
  });
});

describe('isCancelled', () => {
  it('distinguishes a cancellation from a completed receipt', async () => {
    const { isCancelled } = await load();
    expect(isCancelled({ cancelled: true })).toBe(true);
    expect(isCancelled({ storeTransactionId: 'txn-1', store: 'apple' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Expo Go guard — the native SDK must never be imported at module scope.
// ---------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [full] : [];
  });
}

// A *static* import or a `require`, either of which loads the module eagerly.
// A dynamic `import('react-native-purchases')` is deliberately not matched.
const STATIC_IMPORT =
  /(?:^|\n)\s*import\s[^\n]*['"]react-native-purchases['"]|require\(\s*['"]react-native-purchases['"]\s*\)/;

describe('react-native-purchases is never imported eagerly', () => {
  it('has no static import of the native module anywhere the app can load', () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      STATIC_IMPORT.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('reaches the native SDK only through a dynamic import in the purchases port', () => {
    const source = readFileSync(join(SRC, 'lib', 'purchases.ts'), 'utf8');
    // The real adapter must exist and reach the SDK lazily, or gating a paid
    // purchase behind the native module would silently no-op.
    expect(source).toMatch(/await import\(\s*['"]react-native-purchases['"]\s*\)/);
    expect(STATIC_IMPORT.test(source)).toBe(false);
  });
});
