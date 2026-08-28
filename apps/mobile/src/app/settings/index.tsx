import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { type Locale } from '@kitchen/i18n';
import { Screen, Header, AppText, Card, Chip, ToggleRow, ListRow } from '../../components';
import { useLocale } from '../../lib/locale';
import { useSettingsStore } from '../../stores/settings';
import { spacing } from '../../theme';
import { ThemePicker } from '../../features/settings/ThemePicker';

export default function Settings() {
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const easternNumerals = useSettingsStore((state) => state.easternNumerals);
  const setEasternNumerals = useSettingsStore((state) => state.setEasternNumerals);
  const showHijri = useSettingsStore((state) => state.showHijri);
  const setShowHijri = useSettingsStore((state) => state.setShowHijri);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  // Direction is a style on the root view, so the whole UI mirrors on the next
  // render — no relaunch, and no restart prompt to dismiss.
  const chooseLocale = (next: Locale) => {
    if (next !== locale) setLocale(next);
  };

  return (
    <Screen scroll>
      <Header title={t('mobile.settings.title')} onBack={() => router.back()} />

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('common.language')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Chip
            label={t('common.english')}
            selected={locale === 'en'}
            onPress={() => chooseLocale('en')}
          />
          <Chip
            label={t('common.arabic')}
            selected={locale === 'ar'}
            onPress={() => chooseLocale('ar')}
          />
        </View>
      </View>

      <Card style={{ gap: spacing.lg }}>
        <AppText variant="label" muted>
          {t('mobile.settings.appearance')}
        </AppText>
        <ThemePicker />
        <ToggleRow
          label={t('mobile.settings.easternNumerals')}
          hint={t('mobile.settings.easternNumeralsHint')}
          value={easternNumerals}
          onValueChange={setEasternNumerals}
        />
        <ToggleRow
          label={t('mobile.settings.showHijri')}
          hint={t('mobile.settings.showHijriHint')}
          value={showHijri}
          onValueChange={setShowHijri}
        />
      </Card>

      <ListRow
        title={t('mobile.places.entry')}
        subtitle={t('mobile.places.entryHint')}
        showChevron
        onPress={() => router.push('/settings/places')}
      />

      <ListRow
        title={t('mobile.reminders.entry')}
        subtitle={t('mobile.reminders.entryHint')}
        showChevron
        onPress={() => router.push('/settings/reminders')}
      />

      <ListRow
        title={t('mobile.assistant.personaEntry')}
        subtitle={t('mobile.assistant.personaEntryHint')}
        showChevron
        onPress={() => router.push('/settings/assistant')}
      />

      <ListRow
        title={t('mobile.feedback.entry')}
        subtitle={t('mobile.feedback.entryHint')}
        showChevron
        onPress={() => router.push('/settings/feedback')}
      />

      <ListRow
        title={t('mobile.deleteAccount.link')}
        titleColor="danger"
        showChevron
        onPress={() => router.push('/settings/delete-account')}
      />

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.settings.about')}
        </AppText>
        <AppText variant="caption" muted>
          {t('mobile.more.appVersion', { version })}
        </AppText>
      </View>
    </Screen>
  );
}
