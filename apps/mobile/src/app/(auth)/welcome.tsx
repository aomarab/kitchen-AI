import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused, useRouter } from 'expo-router';
import produceImage from '../../../assets/images/welcome-produce.jpg';
import { AppText, Button, Icon, Screen } from '../../components';
import { WelcomeCollage } from '../../features/welcome/WelcomeCollage';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const LOCALES = [
  { value: 'en', labelKey: 'common.english' },
  { value: 'ar', labelKey: 'common.arabic' },
] as const;

const WELCOME_BODY_GAP = spacing.xl;

const FEATURES = [
  {
    icon: 'camera',
    titleKey: 'mobile.welcome.snapTitle',
    bodyKey: 'mobile.welcome.snapBody',
  },
  {
    icon: 'calendar',
    titleKey: 'mobile.welcome.planTitle',
    bodyKey: 'mobile.welcome.planBody',
  },
  {
    icon: 'leaf',
    titleKey: 'mobile.welcome.wasteTitle',
    bodyKey: 'mobile.welcome.wasteBody',
  },
] as const;

function FeatureRow({
  icon,
  title,
  body,
}: {
  icon: (typeof FEATURES)[number]['icon'];
  title: string;
  body: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ width: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" muted>
          {body}
        </AppText>
      </View>
    </View>
  );
}

/**
 * The signed-out landing. It introduces the photo-to-inventory promise before account creation.
 */
export default function Welcome() {
  const { t, locale, setLocale } = useFormat();
  const router = useRouter();
  const isFocused = useIsFocused();
  const collageLabel = t('mobile.welcome.collageLabel');
  const localeToggle = LOCALES.find((option) => option.value !== locale) ?? LOCALES[0];
  const localeToggleLabel = t(localeToggle.labelKey);

  return (
    <Screen
      scroll
      padded={false}
      edges={['bottom', 'left', 'right']}
      contentStyle={{ flexGrow: 1 }}
    >
      {isFocused ? <StatusBar style="light" /> : null}
      <WelcomeCollage produceImage={produceImage} accessibilityLabel={collageLabel} />

      <View style={{ flexGrow: 1, padding: spacing.gutter, gap: WELCOME_BODY_GAP }}>
        <View style={{ gap: spacing.sm }}>
          <AppText variant="eyebrow" color="primaryText">
            {t('common.appName')}
          </AppText>
          <View
            accessible
            accessibilityRole="header"
            accessibilityLabel={`${t('mobile.welcome.headline')} ${t('mobile.welcome.headlineAccent')}`}
            style={{ gap: 0 }}
          >
            <AppText accessible={false} variant="hero">
              {t('mobile.welcome.headline')}
            </AppText>
            <AppText accessible={false} variant="hero" color="primaryText">
              {t('mobile.welcome.headlineAccent')}
            </AppText>
          </View>

          <AppText variant="bodyLarge" muted>
            {t('mobile.welcome.subtitle')}
          </AppText>
        </View>

        <View style={{ gap: spacing.lg }}>
          {FEATURES.map((feature) => (
            <FeatureRow
              key={feature.titleKey}
              icon={feature.icon}
              title={t(feature.titleKey)}
              body={t(feature.bodyKey)}
            />
          ))}
        </View>

        <View style={{ flexGrow: 1 }} />

        <View style={{ gap: spacing.sm }}>
          <Button title={t('mobile.welcome.getStarted')} onPress={() => router.push('/sign-up')} />
          <Button
            title={t('mobile.welcome.haveAccount')}
            variant="ghost"
            onPress={() => router.push('/sign-in')}
          />
          <View style={{ alignItems: 'center' }}>
            <Button
              title={localeToggleLabel}
              accessibilityLabel={t('mobile.welcome.switchLanguageTo', {
                language: localeToggleLabel,
              })}
              variant="ghost"
              size="S"
              fullWidth={false}
              onPress={() => setLocale(localeToggle.value)}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}
