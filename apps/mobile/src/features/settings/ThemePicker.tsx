import { Pressable, View } from 'react-native';
import { AppText, Icon } from '../../components';
import type { MessageKey } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { useSettingsStore, type ThemePreference } from '../../stores/settings';
import { radius, spacing, THEME_FAMILIES, paletteFor, type ThemeFamily } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const FAMILY_LABEL_KEYS: Record<ThemeFamily, MessageKey> = {
  violet: 'mobile.settings.themeViolet',
  terracotta: 'mobile.settings.themeTerracotta',
  green: 'mobile.settings.themeGreen',
};

const MODES: readonly { value: ThemePreference; key: MessageKey }[] = [
  { value: 'system', key: 'mobile.settings.modeSystem' },
  { value: 'light', key: 'mobile.settings.modeLight' },
  { value: 'dark', key: 'mobile.settings.modeDark' },
];

/**
 * A swatch is a miniature of the screen it selects, not a coloured dot.
 *
 * A dot misrepresents the choice: the families differ in their page and card
 * colours as much as in their brand colour, so picking "green" from a green dot
 * and landing on a green *page* is a surprise. Drawing ground, card and brand
 * in their real relationship also makes the light/dark switch visible here,
 * which a single dot cannot show at all.
 *
 * It deliberately does not preview `accent`: violet and green both use blue as
 * their accent, so an accent stripe put a blue bar in the green swatch and made
 * two different families look like the same one.
 */
function Swatch({
  family,
  selected,
  onPress,
}: {
  family: ThemeFamily;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useLocale();
  const { mode, colors } = useTheme();
  const preview = paletteFor(family, mode).colors;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={t(FAMILY_LABEL_KEYS[family])}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      <View
        style={{
          width: '100%',
          minHeight: 56,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: preview.bg,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.primary : colors.border,
          padding: spacing.sm,
          gap: spacing.xs,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            padding: spacing.xs,
            borderRadius: radius.sm,
            backgroundColor: preview.surface,
            borderWidth: 1,
            borderColor: preview.border,
          }}
        >
          <View
            style={{
              height: 12,
              width: 12,
              borderRadius: radius.pill,
              backgroundColor: preview.primary,
            }}
          />
          <View
            style={{
              height: 6,
              flex: 1,
              borderRadius: radius.pill,
              backgroundColor: preview.surfaceAlt,
            }}
          />
        </View>
        <View
          style={{
            height: 8,
            width: '55%',
            borderRadius: radius.pill,
            backgroundColor: preview.primary,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {/* Selection is never carried by colour alone: the whole control *is*
            colour, so a coloured ring would be the one cue a colour-blind user
            cannot read. The tick is the actual signal. */}
        {selected ? <Icon name="check" size={14} color={colors.primaryText} /> : null}
        <AppText
          variant="caption"
          style={{ color: selected ? colors.primaryText : colors.textMuted }}
        >
          {t(FAMILY_LABEL_KEYS[family])}
        </AppText>
      </View>
    </Pressable>
  );
}

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

export function ThemePicker() {
  const { t } = useLocale();
  const { colors, isDark } = useTheme();
  const family = useSettingsStore((state) => state.themeFamily);
  const setFamily = useSettingsStore((state) => state.setThemeFamily);
  const preference = useSettingsStore((state) => state.themePreference);
  const setPreference = useSettingsStore((state) => state.setThemePreference);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
        <View style={{ gap: 2 }}>
          <AppText variant="label">{t('mobile.settings.theme')}</AppText>
          <AppText variant="caption" muted>
            {t('mobile.settings.themeHint')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {THEME_FAMILIES.map((candidate) => (
            <Swatch
              key={candidate}
              family={candidate}
              selected={candidate === family}
              onPress={() => setFamily(candidate)}
            />
          ))}
        </View>
      </View>

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
    </View>
  );
}
