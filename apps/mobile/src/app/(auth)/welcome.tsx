import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import produceImage from '../../../assets/images/welcome-produce.jpg';
import saladImage from '../../../assets/images/welcome-salad.jpg';
import { AppText, Button, Screen, SegmentedControl } from '../../components';
import { WelcomeCollage } from '../../features/welcome/WelcomeCollage';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';

/**
 * Each language is written in its own script, so someone who cannot read the
 * current one can still find theirs.
 */
const LOCALES = [
  { value: 'en', labelKey: 'common.english' },
  { value: 'ar', labelKey: 'common.arabic' },
] as const;

/**
 * The signed-out landing. It introduces the photo-to-inventory promise before
 * account creation, while keeping language choice and sign-in one tap away.
 */
export default function Welcome() {
  const { t, locale, setLocale } = useFormat();
  const router = useRouter();
  const collageLabel = t('mobile.welcome.collageLabel');
  const haveAccount = t('mobile.welcome.haveAccountShort');
  const signIn = t('auth.signIn');

  return (
    <Screen scroll contentStyle={{ flexGrow: 1, gap: spacing.lg }}>
      <View style={{ alignSelf: 'flex-end', width: 168 }}>
        <SegmentedControl
          options={LOCALES.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          value={locale}
          onChange={(next) => {
            if (next !== locale) setLocale(next);
          }}
        />
      </View>

      <WelcomeCollage
        produceImage={produceImage}
        saladImage={saladImage}
        accessibilityLabel={collageLabel}
      />

      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${t('mobile.welcome.headline')} ${t('mobile.welcome.headlineAccent')}`}
        style={{ gap: spacing.xs }}
      >
        <AppText accessible={false} variant="hero">
          {t('mobile.welcome.headline')}
        </AppText>
        <AppText accessible={false} variant="hero" color="primaryText">
          {t('mobile.welcome.headlineAccent')}
        </AppText>
      </View>

      <AppText variant="body" muted>
        {t('mobile.welcome.subtitle')}
      </AppText>

      <View style={{ flexGrow: 1, minHeight: spacing.md }} />

      <View style={{ gap: spacing.sm }}>
        <Button
          title={t('mobile.welcome.getStarted')}
          arrow
          onPress={() => router.push('/sign-up')}
        />

        <View
          style={{
            minHeight: 44,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
          }}
        >
          <AppText variant="caption" muted>
            {haveAccount} ·
          </AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${haveAccount}, ${signIn}`}
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AppText variant="label" color="primaryText">
              {signIn}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
