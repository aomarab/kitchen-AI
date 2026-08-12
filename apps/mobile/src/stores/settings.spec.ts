import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store persists through the document directory, which is an Expo native
// module that does not parse under node. Mock it at the boundary; the contents
// of the saved file are what these tests are actually about.
const { fileSystem } = vi.hoisted(() => ({
  fileSystem: {
    documentDirectory: 'file:///doc/',
    getInfoAsync: vi.fn(async (_uri: string) => ({ exists: true })),
    readAsStringAsync: vi.fn(async (_uri: string) => '{}'),
    writeAsStringAsync: vi.fn(async (_uri: string, _contents: string) => undefined),
    deleteAsync: vi.fn(async () => undefined),
  },
}));
vi.mock('expo-file-system/legacy', () => fileSystem);

import { useSettingsStore } from './settings';
import { DEFAULT_LEAD_DAYS, DEFAULT_REMINDER_HOUR } from '../lib/notifications';

beforeEach(() => {
  fileSystem.readAsStringAsync.mockReset();
  fileSystem.writeAsStringAsync.mockReset();
  fileSystem.getInfoAsync.mockReset().mockResolvedValue({ exists: true });
  useSettingsStore.setState({
    notifyExpiry: true,
    notifyMeals: true,
    expiryLeadDays: DEFAULT_LEAD_DAYS,
    reminderHour: DEFAULT_REMINDER_HOUR,
  });
});

describe('notification settings', () => {
  it('reminds by default, because a reminder nobody enabled never fires', async () => {
    expect(useSettingsStore.getState().notifyExpiry).toBe(true);
    expect(useSettingsStore.getState().notifyMeals).toBe(true);
  });

  it('keeps the defaults when reading a settings file written before they existed', async () => {
    // The real upgrade path: everyone already using the app has a settings
    // file with only the two display keys in it. Reading a missing boolean as
    // `false` would silently opt every existing user out of the whole feature.
    fileSystem.readAsStringAsync.mockResolvedValue(
      JSON.stringify({ easternNumerals: true, showHijri: false }),
    );

    await useSettingsStore.getState().hydrate();

    const state = useSettingsStore.getState();
    expect(state.easternNumerals).toBe(true);
    expect(state.showHijri).toBe(false);
    expect(state.notifyExpiry).toBe(true);
    expect(state.notifyMeals).toBe(true);
    expect(state.expiryLeadDays).toBe(DEFAULT_LEAD_DAYS);
    expect(state.reminderHour).toBe(DEFAULT_REMINDER_HOUR);
  });

  it('restores a deliberate opt-out', async () => {
    // The mirror of the test above: `!== false` must not become "always true",
    // or turning notifications off would never survive a restart.
    fileSystem.readAsStringAsync.mockResolvedValue(
      JSON.stringify({ notifyExpiry: false, notifyMeals: false, expiryLeadDays: 7, reminderHour: 9 }),
    );

    await useSettingsStore.getState().hydrate();

    const state = useSettingsStore.getState();
    expect(state.notifyExpiry).toBe(false);
    expect(state.notifyMeals).toBe(false);
    expect(state.expiryLeadDays).toBe(7);
    expect(state.reminderHour).toBe(9);
  });

  it('writes the notification preferences, not only the display ones', async () => {
    useSettingsStore.getState().setExpiryLeadDays(5);

    const written = fileSystem.writeAsStringAsync.mock.calls.at(-1)?.[1] ?? '{}';
    expect(JSON.parse(String(written))).toMatchObject({
      expiryLeadDays: 5,
      notifyExpiry: true,
      notifyMeals: true,
      reminderHour: DEFAULT_REMINDER_HOUR,
    });
  });
});
