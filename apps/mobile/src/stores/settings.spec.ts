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
    notifyExpired: true,
    notifyShopping: false,
    notifyPlanning: false,
    expiryLeadDays: DEFAULT_LEAD_DAYS,
    reminderHour: DEFAULT_REMINDER_HOUR,
  });
});

describe('notification settings', () => {
  it('reminds by default, because a reminder nobody enabled never fires', async () => {
    expect(useSettingsStore.getState().notifyExpiry).toBe(true);
    expect(useSettingsStore.getState().notifyMeals).toBe(true);
  });

  it('ships the naggier reminders switched off', async () => {
    // Waste is the point of the app, so the two that watch food are on. The
    // shopping and planning nudges fire on a state that can sit unchanged for
    // weeks, so they are opt-in rather than something to discover and disable.
    expect(useSettingsStore.getState().notifyExpired).toBe(true);
    expect(useSettingsStore.getState().notifyShopping).toBe(false);
    expect(useSettingsStore.getState().notifyPlanning).toBe(false);
  });

  it('does not switch the opt-in reminders on when reading an older file', async () => {
    // `!== false` is right for the on-by-default keys and wrong for these: it
    // would turn on reminders the user has never been asked about.
    fileSystem.readAsStringAsync.mockResolvedValue(
      JSON.stringify({ notifyExpiry: true, notifyMeals: true }),
    );

    await useSettingsStore.getState().hydrate();

    const state = useSettingsStore.getState();
    expect(state.notifyExpired).toBe(true);
    expect(state.notifyShopping).toBe(false);
    expect(state.notifyPlanning).toBe(false);
  });

  it('restores the opt-in reminders once they are chosen', async () => {
    fileSystem.readAsStringAsync.mockResolvedValue(
      JSON.stringify({ notifyShopping: true, notifyPlanning: true, notifyExpired: false }),
    );

    await useSettingsStore.getState().hydrate();

    const state = useSettingsStore.getState();
    expect(state.notifyShopping).toBe(true);
    expect(state.notifyPlanning).toBe(true);
    expect(state.notifyExpired).toBe(false);
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
