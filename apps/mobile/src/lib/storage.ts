import * as FileSystem from 'expo-file-system/legacy';

/**
 * Small JSON key/value store backed by the document directory. Used for
 * non-sensitive app state (settings, the offline event queue, cached session
 * metadata). Tokens are NOT stored here — see `token-store.ts`, which uses the
 * OS keychain via `expo-secure-store`.
 */

function uriFor(key: string): string {
  const base = FileSystem.documentDirectory ?? '';
  return `${base}kitchen.${key}.json`;
}

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const uri = uriFor(key);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(uriFor(key), JSON.stringify(value));
  } catch {
    // Persistence is best-effort; a failed write must never crash the UI.
  }
}

export async function removeJson(key: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uriFor(key), { idempotent: true });
  } catch {
    // ignore
  }
}
