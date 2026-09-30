import { View, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { type Locale } from '@kitchen/i18n';
import { ASSISTANT_PERSONAS } from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Button,
  ListGroup,
  ListRow,
  SectionLabel,
  ToggleRow,
} from '../../components';
import { useLocale } from '../../lib/locale';
import { useSettingsStore } from '../../stores/settings';
import { spacing } from '../../theme';
import { ThemePicker } from '../../features/settings/ThemePicker';
import { useProfile } from '../../hooks/profile';
import { resolvePersonaSelection } from '../../lib/assistant/persona';

const PRIVACY_POLICY_URL = 'https://aomarab.github.io/kitchen-AI/privacy-policy.html';
const TERMS_URL = 'https://aomarab.github.io/kitchen-AI/terms-of-service.html';

export default function Settings() {
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const easternNumerals = useSettingsStore((state) => state.easternNumerals);
  const setEasternNumerals = useSettingsStore((state) => state.setEasternNumerals);
  const showHijri = useSettingsStore((state) => state.showHijri);
  const setShowHijri = useSettingsStore((state) => state.setShowHijri);
  const profile = useProfile();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const currentLanguageLabel = locale === 'ar' ? t('common.arabic') : t('common.english');
  const nextLocale: Locale = locale === 'ar' ? 'en' : 'ar';
  const nextLanguageLabel = nextLocale === 'ar' ? t('common.arabic') : t('common.english');
  const persona = profile.data ? resolvePersonaSelection(profile.data.assistantPersona) : null;
  const personaDialect = persona ? ASSISTANT_PERSONAS[persona].dialect : null;
  const personaValue =
    persona && personaDialect
      ? `${t(`persona.${persona}`)} · ${t(`dialect.${personaDialect}`)}`
      : undefined;

  const chooseLocale = (next: Locale) => {
    if (next !== locale) setLocale(next);
  };

  return (
    <Screen scroll>
      <Header title={t('mobile.settings.title')} onBack={() => router.back()} />

      <View style={{ gap: spacing.sm }}>
        <SectionLabel small>{t('mobile.settings.appearance')}</SectionLabel>
        <AppText variant="bodyStrong">{t('mobile.settings.mode')}</AppText>
        <ThemePicker />
        <AppText variant="caption" muted>
          {t('mobile.settings.modeSystemHint')}
        </AppText>
      </View>

      <ListGroup>
        <ListRow
          icon="globe"
          title={t('common.language')}
          value={currentLanguageLabel}
          showChevron
          accessibilityHint={t('mobile.welcome.switchLanguageTo', { language: nextLanguageLabel })}
          onPress={() => chooseLocale(nextLocale)}
        />
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
      </ListGroup>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel small>{t('mobile.settings.kitchenSection')}</SectionLabel>
        <ListGroup>
          <ListRow
            icon="bell"
            title={t('mobile.settings.notifications')}
            subtitle={t('mobile.settings.notificationsHint')}
            showChevron
            onPress={() => router.push('/settings/notifications')}
          />
          <ListRow
            icon="box"
            title={t('mobile.places.entry')}
            subtitle={t('mobile.places.entryHint')}
            showChevron
            onPress={() => router.push('/settings/places')}
          />
          <ListRow
            icon="activity"
            title={t('mobile.reminders.entry')}
            subtitle={t('mobile.reminders.entryHint')}
            showChevron
            onPress={() => router.push('/settings/reminders')}
          />
          <ListRow
            icon="volume"
            title={t('mobile.assistant.personaEntry')}
            subtitle={personaValue}
            showChevron
            onPress={() => router.push('/settings/assistant')}
          />
        </ListGroup>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel small>{t('mobile.settings.about')}</SectionLabel>
        <ListGroup>
          <ListRow
            icon="chat"
            title={t('mobile.feedback.entry')}
            showChevron
            onPress={() => router.push('/settings/feedback')}
          />
          <ListRow
            icon="lock"
            title={t('mobile.settings.privacyPolicy')}
            showChevron
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          />
          <ListRow
            icon="text"
            title={t('mobile.settings.terms')}
            showChevron
            onPress={() => void Linking.openURL(TERMS_URL)}
          />
        </ListGroup>
      </View>

      <Button
        title={t('mobile.deleteAccount.link')}
        variant="ghost"
        tone="danger"
        fullWidth={false}
        onPress={() => router.push('/settings/delete-account')}
      />

      <AppText variant="small" muted>
        {t('mobile.more.appVersion', { version })}
      </AppText>
    </Screen>
  );
}
