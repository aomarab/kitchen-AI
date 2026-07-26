import { useState } from 'react';
import { I18nManager, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { directionFor, type Locale } from '@kitchen/i18n';
import { Screen, Header, AppText, Button, Card, Chip, Sheet, ToggleRow } from '../../components';
import { useLocale } from '../../lib/locale';
import { useSettingsStore } from '../../stores/settings';
import { spacing } from '../../theme';

export default function Settings() {
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const easternNumerals = useSettingsStore((state) => state.easternNumerals);
  const setEasternNumerals = useSettingsStore((state) => state.setEasternNumerals);
  const showHijri = useSettingsStore((state) => state.showHijri);
  const setShowHijri = useSettingsStore((state) => state.setShowHijri);
  const [restart, setRestart] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const chooseLocale = (next: Locale) => {
    if (next === locale) return;
    const willFlip = (directionFor(next) === 'rtl') !== I18nManager.isRTL;
    setLocale(next);
    if (willFlip) setRestart(true);
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

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.settings.about')}
        </AppText>
        <AppText variant="caption" muted>
          {t('mobile.more.appVersion', { version })}
        </AppText>
      </View>

      <Sheet
        visible={restart}
        onClose={() => setRestart(false)}
        title={t('mobile.settings.rtlRestartTitle')}
      >
        <AppText muted>{t('mobile.settings.rtlRestartBody')}</AppText>
        <Button title={t('mobile.settings.restartLater')} onPress={() => setRestart(false)} />
      </Sheet>
    </Screen>
  );
}
