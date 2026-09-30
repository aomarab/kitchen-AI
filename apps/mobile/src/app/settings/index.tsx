import { View, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { type Locale } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Card,
  Chip,
  ToggleRow,
  ListGroup,
  ListRow,
  SectionLabel,
} from '../../components';
import { useLocale } from '../../lib/locale';
import { useSettingsStore } from '../../stores/settings';
import { spacing } from '../../theme';
import { ThemePicker } from '../../features/settings/ThemePicker';

const PRIVACY_POLICY_URL = 'https://aomarab.github.io/kitchen-AI/privacy-policy.html';
const TERMS_URL = 'https://aomarab.github.io/kitchen-AI/terms-of-service.html';

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

      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{t('common.language')}</SectionLabel>
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

        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{t('mobile.settings.appearance')}</SectionLabel>
          <ThemePicker />
        </View>
      </Card>

      <ListGroup>
        <ToggleRow
          grouped
          label={t('mobile.settings.easternNumerals')}
          hint={t('mobile.settings.easternNumeralsHint')}
          value={easternNumerals}
          onValueChange={setEasternNumerals}
        />
        <ToggleRow
          grouped
          label={t('mobile.settings.showHijri')}
          hint={t('mobile.settings.showHijriHint')}
          value={showHijri}
          onValueChange={setShowHijri}
        />
      </ListGroup>

      <ListGroup>
        <ListRow
          grouped
          icon="location"
          title={t('mobile.places.entry')}
          showChevron
          onPress={() => router.push('/settings/places')}
        />

        <ListRow
          grouped
          icon="clock"
          title={t('mobile.reminders.entry')}
          showChevron
          onPress={() => router.push('/settings/reminders')}
        />

        <ListRow
          grouped
          icon="mic"
          title={t('mobile.assistant.personaEntry')}
          showChevron
          onPress={() => router.push('/settings/assistant')}
        />
      </ListGroup>

      <ListGroup>
        <ListRow
          grouped
          icon="captions"
          title={t('mobile.feedback.entry')}
          showChevron
          onPress={() => router.push('/settings/feedback')}
        />
      </ListGroup>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('mobile.settings.legal')}</SectionLabel>
        <ListGroup>
          <ListRow
            grouped
            icon="info"
            title={t('mobile.settings.privacyPolicy')}
            showChevron
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          />

          <ListRow
            grouped
            icon="info"
            title={t('mobile.settings.terms')}
            showChevron
            onPress={() => void Linking.openURL(TERMS_URL)}
          />
        </ListGroup>
      </View>

      <ListGroup>
        <ListRow
          grouped
          icon="trash"
          title={t('mobile.deleteAccount.link')}
          titleColor="danger"
          showChevron
          onPress={() => router.push('/settings/delete-account')}
        />
      </ListGroup>

      <View style={{ gap: spacing.xs }}>
        <SectionLabel>{t('mobile.settings.about')}</SectionLabel>
        <AppText variant="caption" muted>
          {t('mobile.more.appVersion', { version })}
        </AppText>
      </View>
    </Screen>
  );
}
