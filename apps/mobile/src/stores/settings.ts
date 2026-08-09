import { create } from 'zustand';
import { readJson, writeJson } from '../lib/storage';

const PERSIST_KEY = 'settings';

interface PersistedSettings {
  easternNumerals: boolean;
  showHijri: boolean;
}

interface SettingsState extends PersistedSettings {
  setEasternNumerals: (value: boolean) => void;
  setShowHijri: (value: boolean) => void;
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

  setEasternNumerals: (value) => {
    set({ easternNumerals: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  setShowHijri: (value) => {
    set({ showHijri: value });
    void writeJson(PERSIST_KEY, current(get()));
  },

  hydrate: async () => {
    const saved = await readJson<PersistedSettings>(PERSIST_KEY);
    if (saved) set({ easternNumerals: !!saved.easternNumerals, showHijri: saved.showHijri !== false });
  },
}));

function current(state: PersistedSettings): PersistedSettings {
  return { easternNumerals: state.easternNumerals, showHijri: state.showHijri };
}
