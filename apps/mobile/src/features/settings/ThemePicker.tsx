import { Pressable, View } from 'react-native';
import { AppText } from '../../components';
import type { MessageKey } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { useSettingsStore, type ThemePreference } from '../../stores/settings';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const MODES: readonly { value: ThemePreference; key: MessageKey }[] = [
  { value: 'system', key: 'mobile.settings.modeSystem' },
  { value: 'light', key: 'mobile.settings.modeLight' },
  { value: 'dark', key: 'mobile.settings.modeDark' },
];

function ModeButton({
  mode,
  selected,
  onPress,
}: {
  mode: ThemePreference;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useLocale();
  const { colors, isDark } = useTheme();
  const entry = MODES.find((candidate) => candidate.value === mode)!;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        // The selected segment has to read as *raised*, which means one step
        // toward the foreground — lighter on a light theme, and lighter again
        // on a dark one. Hard-coding `surface` gets this backwards in dark
        // mode, where `surface` is darker than the track and the selected
        // segment looks like a hole punched in the control.
        backgroundColor: selected ? (isDark ? colors.surfaceAlt : colors.surface) : 'transparent',
        borderWidth: 1,
        borderColor: selected ? colors.border : 'transparent',
      }}
    >
      <AppText variant="label" style={{ color: selected ? colors.text : colors.textMuted }}>
        {t(entry.key)}
      </AppText>
    </Pressable>
  );
}

/**
 * Appearance: System / Light / Dark. There is one palette, Apricot, so the
 * colour-family swatches this used to show are gone; the mode is the only
 * choice left (mobile redesign spec §6.6).
 */
export function ThemePicker() {
  const { t } = useLocale();
  const { colors, isDark } = useTheme();
  const preference = useSettingsStore((state) => state.themePreference);
  const setPreference = useSettingsStore((state) => state.setThemePreference);

  return (
    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
      <View style={{ gap: 2 }}>
        <AppText variant="label">{t('mobile.settings.mode')}</AppText>
        {/* Only while 'Automatic' is selected. Left permanently on, it claims
            the app follows the phone even when the user has just pinned Dark
            — a hint that contradicts the control beneath it. */}
        {preference === 'system' ? (
          <AppText variant="caption" muted>
            {t('mobile.settings.modeSystemHint')}
          </AppText>
        ) : null}
      </View>
      {/* A segmented control rather than three chips: the options are mutually
          exclusive and cover the whole axis, so the enclosing track is the
          affordance that says "pick one of these", which loose pills do not. */}
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.xs,
          padding: spacing.xs,
          borderRadius: radius.lg,
          backgroundColor: isDark ? colors.surface : colors.surfaceAlt,
        }}
      >
        {MODES.map((entry) => (
          <ModeButton
            key={entry.value}
            mode={entry.value}
            selected={entry.value === preference}
            onPress={() => setPreference(entry.value)}
          />
        ))}
      </View>
    </View>
  );
}
