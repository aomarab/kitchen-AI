import { Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import brandMark from '../../../assets/icon.png';
import { useRouter } from 'expo-router';
import { AppText, Button, Icon, Screen } from '../../components';
import type { IconName } from '../../components';
import { useLocale } from '../../lib/locale';
import { hitSlop, radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

interface ValuePoint {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

/**
 * Each language is written in its own script, so someone who cannot read the
 * current one can still find theirs.
 */
const LOCALES = [
  { code: 'en', labelKey: 'common.english' },
  { code: 'ar', labelKey: 'common.arabic' },
] as const;

/**
 * The signed-out landing. It exists because the first thing a new arrival used
 * to see was a password field, which explains nothing about what the app is
 * for. Deliberately not a swipeable carousel: sign-in is one tap away rather
 * than three slides away, and returning users are not made to scrub past an
 * introduction they have already read.
 */
export default function Welcome() {
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const { colors, tintFor } = useTheme();
  // Only the top edge is inset by `Screen`, so the light panel below can run to
  // the physical bottom instead of leaving a dark strip beneath it. That means
  // the bottom inset has to be re-applied here, or the second button lands
  // under the home indicator.
  const insets = useSafeAreaInsets();

  const points: readonly ValuePoint[] = [
    {
      icon: 'camera',
      title: t('mobile.welcome.snapTitle'),
      body: t('mobile.welcome.snapBody'),
    },
    {
      icon: 'restaurant',
      title: t('mobile.welcome.planTitle'),
      body: t('mobile.welcome.planBody'),
    },
    { icon: 'bell', title: t('mobile.welcome.wasteTitle'), body: t('mobile.welcome.wasteBody') },
  ];

  return (
    <Screen
      scroll
      padded={false}
      edges={['top']}
      style={{ backgroundColor: colors.surfaceInverse }}
    >
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        {/*
         * The language choice sits above everything else because an Arabic
         * speaker should not have to read an English screen, create an account
         * and find Settings before the app speaks to them.
         */}
        <View
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.borderInverse,
            backgroundColor: colors.surfaceInverseAlt,
            padding: 2,
          }}
        >
          {LOCALES.map((option) => {
            const active = locale === option.code;
            return (
              <Pressable
                key={option.code}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(option.labelKey)}
                hitSlop={hitSlop}
                onPress={() => !active && setLocale(option.code)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm - 2,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primaryInverse : 'transparent',
                }}
              >
                <AppText
                  variant="label"
                  style={{ color: active ? colors.onPrimaryInverse : colors.textInverseMuted }}
                >
                  {t(option.labelKey)}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
          <Image
            source={brandMark}
            style={{ width: 84, height: 84, borderRadius: radius.lg }}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <AppText variant="display" color="textInverse" center>
            {t('common.appName')}
          </AppText>
          <AppText color="textInverseMuted" center>
            {t('mobile.welcome.tagline')}
          </AppText>
        </View>
      </View>

      <View
        style={{
          flexGrow: 1,
          backgroundColor: colors.bg,
          borderTopStartRadius: radius.lg,
          borderTopEndRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.lg,
        }}
      >
        <View style={{ gap: spacing.lg, flexGrow: 1, justifyContent: 'center' }}>
          {points.map((point, index) => {
            const tint = tintFor(index);
            return (
              <View
                key={point.icon}
                style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    backgroundColor: tint.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={point.icon} size={22} color={tint.fg} />
                </View>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <AppText variant="heading">{point.title}</AppText>
                  <AppText muted>{point.body}</AppText>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ gap: spacing.sm, paddingBottom: insets.bottom }}>
          <Button title={t('mobile.welcome.getStarted')} onPress={() => router.push('/sign-up')} />
          <Button
            title={t('mobile.welcome.haveAccount')}
            variant="secondary"
            onPress={() => router.push('/sign-in')}
          />
        </View>
      </View>
    </Screen>
  );
}
