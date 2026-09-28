import type { MessageKey } from '@kitchen/i18n';
import { SegmentedControl } from '../../components';
import { useLocale } from '../../lib/locale';
import { useSettingsStore, type ThemePreference } from '../../stores/settings';

const MODES: readonly { value: ThemePreference; key: MessageKey }[] = [
  { value: 'system', key: 'mobile.settings.modeSystem' },
  { value: 'light', key: 'mobile.settings.modeLight' },
  { value: 'dark', key: 'mobile.settings.modeDark' },
];

/**
 * Appearance: System / Light / Dark. There is one palette, Coral, so the
 * colour-family swatches this used to show are gone; the mode is the only
 * choice left (mobile redesign spec §6.6).
 */
export function ThemePicker() {
  const { t } = useLocale();
  const preference = useSettingsStore((state) => state.themePreference);
  const setPreference = useSettingsStore((state) => state.setThemePreference);
  const options = MODES.map((entry) => ({ value: entry.value, label: t(entry.key) }));

  return (
    <SegmentedControl<ThemePreference>
      options={options}
      value={preference}
      onChange={setPreference}
    />
  );
}
