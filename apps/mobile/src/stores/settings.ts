import { create } from 'zustand';
import { readJson, writeJson } from '../lib/storage';
import { DEFAULT_LEAD_DAYS, DEFAULT_REMINDER_HOUR } from '../lib/notifications';
import { DEFAULT_THEME_FAMILY, THEME_FAMILIES, type ThemeFamily } from '../theme/palettes';

/** 'system' follows the OS switch; the other two pin it regardless. */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const PERSIST_KEY = 'settings';

interface PersistedSettings {
  easternNumerals: boolean;
  showHijri: boolean;
  /**
   * Notification preferences live here rather than on the server because the
   * notifications themselves are scheduled on this device: another phone in
   * the same household has its own inventory cache and its own quiet hours.
   */
  notifyExpiry: boolean;
  notifyMeals: boolean;
  notifyExpired: boolean;
  notifyShopping: boolean;
  notifyPlanning: boolean;
  notifyTimers: boolean;
  expiryLeadDays: number;
  reminderHour: number;
  themeFamily: ThemeFamily;
  themePreference: ThemePreference;
}

interface SettingsState extends PersistedSettings {
  setEasternNumerals: (value: boolean) => void;
  setShowHijri: (value: boolean) => void;
  setNotifyExpiry: (value: boolean) => void;
  setNotifyMeals: (value: boolean) => void;
  setNotifyExpired: (value: boolean) => void;
  setNotifyShopping: (value: boolean) => void;
  setNotifyPlanning: (value: boolean) => void;
  setNotifyTimers: (value: boolean) => void;
  setExpiryLeadDays: (value: number) => void;
  setReminderHour: (value: number) => void;
  setThemeFamily: (value: ThemeFamily) => void;
  setThemePreference: (value: ThemePreference) => void;
  hydrate: () => Promise<void>;
}

/**
 * Display preferences from spec §7: Western Arabic numerals by default with an
 * Eastern Arabic opt-in, and a Hijri date shown alongside the Gregorian one in
 * Arabic (on by default).
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  easternNumerals: false,
  showHijri: true,
  // On by default: the whole point of the app is not wasting food, and a
  // reminder nobody switched on never fires. Both are one tap to silence.
  notifyExpiry: true,
  notifyMeals: true,
  notifyExpired: true,
  // Off by default. These two are useful but they are also the ones that can
  // nag: a shopping list nobody is shopping for, and a planning nudge for
  // someone who plans on Sundays. Opt in, rather than opt out after annoyance.
  notifyShopping: false,
  notifyPlanning: false,
  // On by default, with the other two opt-outs rather than the opt-ins: a
  // timer alert is not the app volunteering an opinion, it is the answer to
  // something the user just asked for.
  notifyTimers: true,
  expiryLeadDays: DEFAULT_LEAD_DAYS,
  reminderHour: DEFAULT_REMINDER_HOUR,
  themeFamily: DEFAULT_THEME_FAMILY,
  // Defaults to following the phone. Someone who has set their device to dark
  // has already told us what they want; asking again in-app is redundant.
  themePreference: 'system',

  setEasternNumerals: (value) => {
    set({ easternNumerals: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setShowHijri: (value) => {
    set({ showHijri: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setNotifyExpiry: (value) => {
    set({ notifyExpiry: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setNotifyMeals: (value) => {
    set({ notifyMeals: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setNotifyExpired: (value) => {
    set({ notifyExpired: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setNotifyShopping: (value) => {
    set({ notifyShopping: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setNotifyPlanning: (value) => {
    set({ notifyPlanning: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setNotifyTimers: (value) => {
    set({ notifyTimers: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setExpiryLeadDays: (value) => {
    set({ expiryLeadDays: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setReminderHour: (value) => {
    set({ reminderHour: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setThemeFamily: (value) => {
    set({ themeFamily: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setThemePreference: (value) => {
    set({ themePreference: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  hydrate: async () => {
    const saved = await readJson<PersistedSettings>(PERSIST_KEY);
    if (!saved) return;
    set({
      easternNumerals: !!saved.easternNumerals,
      showHijri: saved.showHijri !== false,
      // `!== false` rather than `??` so a settings file written before these
      // existed keeps the on-by-default behaviour instead of reading as off.
      notifyExpiry: saved.notifyExpiry !== false,
      notifyMeals: saved.notifyMeals !== false,
      notifyExpired: saved.notifyExpired !== false,
      // `=== true` for the pair that ships off, so an older settings file
      // does not silently switch them on the first time it is read back.
      notifyShopping: saved.notifyShopping === true,
      notifyPlanning: saved.notifyPlanning === true,
      notifyTimers: saved.notifyTimers !== false,
      expiryLeadDays: saved.expiryLeadDays ?? DEFAULT_LEAD_DAYS,
      reminderHour: saved.reminderHour ?? DEFAULT_REMINDER_HOUR,
      // Validated against the known sets rather than cast: a settings file
      // written by a future build with a fourth family must not put an
      // undefined palette on screen after a downgrade.
      themeFamily: THEME_FAMILIES.includes(saved.themeFamily)
        ? saved.themeFamily
        : DEFAULT_THEME_FAMILY,
      themePreference: THEME_PREFERENCES.includes(saved.themePreference)
        ? saved.themePreference
        : 'system',
    });
  },
}));

function current(state: PersistedSettings): PersistedSettings {
  return {
    easternNumerals: state.easternNumerals,
    showHijri: state.showHijri,
    notifyExpiry: state.notifyExpiry,
    notifyMeals: state.notifyMeals,
    notifyExpired: state.notifyExpired,
    notifyShopping: state.notifyShopping,
    notifyPlanning: state.notifyPlanning,
    notifyTimers: state.notifyTimers,
    expiryLeadDays: state.expiryLeadDays,
    reminderHour: state.reminderHour,
    themeFamily: state.themeFamily,
    themePreference: state.themePreference,
  };
}
