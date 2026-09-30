import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { AppText, Button, Header, ListGroup, ListRow, Screen, SectionLabel } from '../components';
import type { IconName } from '../components';
import { AccountHero } from '../features/account/AccountHero';
import { useCredits } from '../hooks/credits';
import { useHouseholds, useProfile } from '../hooks/profile';
import { useFormat } from '../hooks/useFormat';
import {
  accountDietKey,
  activeHouseholdForAccount,
  messageKeyForDiet,
} from '../lib/account-summary';
import { totalCredits } from '../lib/credits';
import { resetToSignIn } from '../lib/entry-route';
import { formatQty } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { spacing } from '../theme';

export default function Account() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const activeHouseholdId = useAuthStore((state) => state.activeHouseholdId);
  const credits = useCredits();
  const profile = useProfile();
  const households = useHouseholds();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const balance = credits.data ? formatQty(locale, totalCredits(credits.data), prefs) : undefined;
  const activeHousehold = activeHouseholdForAccount(households.data, activeHouseholdId);
  const preferenceSubtitle = profile.data
    ? `${t(messageKeyForDiet(accountDietKey(profile.data)))} · ${t('mobile.account.peopleCount', {
        count: profile.data.householdSize,
      })}`
    : undefined;
  const householdSubtitle = activeHousehold
    ? `${activeHousehold.name} · ${t('mobile.account.membersCount', {
        count: activeHousehold.members.length,
      })}`
    : undefined;
  const creditsSubtitle = balance
    ? t('mobile.credits.packCredits', { credits: balance })
    : undefined;
  const profileName = user?.displayName ?? t('mobile.more.profile');

  const row = (title: string, icon: IconName, href: string, subtitle?: string) => (
    <ListRow
      title={title}
      icon={icon}
      subtitle={subtitle}
      showChevron
      onPress={() => router.push(href)}
    />
  );

  return (
    <Screen scroll contentStyle={{ gap: spacing.md }}>
      <Header title={t('mobile.account.title')} onBack={() => router.back()} />

      <AccountHero
        name={profileName}
        email={user?.email}
        profileHint={user ? t('mobile.more.profile') : undefined}
        onPress={() => router.push('/profile')}
      />

      <View style={{ gap: spacing.sm }}>
        <SectionLabel small>{t('mobile.account.kitchenSection')}</SectionLabel>
        <ListGroup>
          {row(t('mobile.more.profile'), 'sliders', '/profile', preferenceSubtitle)}
          {row(t('mobile.more.household'), 'users', '/settings/household', householdSubtitle)}
          {row(t('mobile.more.credits'), 'coins', '/ai-usage', creditsSubtitle)}
        </ListGroup>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel small>{t('mobile.account.toolsSection')}</SectionLabel>
        <ListGroup>
          {row(
            t('mobile.screen.entry'),
            'tablet',
            '/screen',
            t('mobile.account.kitchenScreenSubtitle'),
          )}
          {row(t('mobile.timers.entry'), 'timer', '/timers')}
          {row(t('mobile.wellness.entry'), 'activity', '/wellness')}
        </ListGroup>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel small>{t('mobile.account.appSection')}</SectionLabel>
        <ListGroup>
          {row(t('mobile.more.notifications'), 'bell', '/settings/notifications')}
          {row(t('mobile.more.settings'), 'settings', '/settings')}
        </ListGroup>
      </View>

      <View style={{ gap: spacing.lg }}>
        <Button
          title={t('mobile.more.signOut')}
          variant="secondary"
          tone="danger"
          leadingIcon="logout"
          onPress={() => {
            void signOut().then(() => resetToSignIn(router));
          }}
        />
        <AppText variant="small" muted center>
          {t('mobile.more.appVersion', { version })}
        </AppText>
      </View>
    </Screen>
  );
}
