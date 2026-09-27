import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { AppText, Avatar, Button, Header, ListGroup, ListRow, Screen } from '../components';
import type { IconName } from '../components';
import { useCredits } from '../hooks/credits';
import { useFormat } from '../hooks/useFormat';
import { totalCredits } from '../lib/credits';
import { formatQty } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { spacing } from '../theme';

/**
 * Account (spec §4.2), behind the avatar on every tab header. It holds every
 * row the retired More tab held, in white group cards: who you are, then the
 * household, the kitchen tools and the preferences. Shop is a tab now, so it
 * has no row here.
 */
export default function Account() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const credits = useCredits();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const balance = credits.data ? formatQty(locale, totalCredits(credits.data), prefs) : undefined;

  const row = (title: string, icon: IconName, href: string, value?: string) => (
    <ListRow
      grouped
      title={title}
      icon={icon}
      value={value}
      showChevron
      onPress={() => router.push(href)}
    />
  );

  return (
    <Screen scroll>
      <Header title={t('mobile.account.title')} onBack={() => router.back()} />

      <ListGroup>
        <ListRow
          grouped
          title={user?.displayName ?? t('mobile.more.profile')}
          subtitle={user?.email}
          leading={<Avatar name={user?.displayName} />}
          accessibilityHint={user ? t('mobile.more.profile') : undefined}
          showChevron
          onPress={() => router.push('/profile')}
        />
      </ListGroup>

      <ListGroup>
        {row(t('mobile.more.household'), 'household', '/settings/household')}
        {row(t('mobile.more.credits'), 'wallet', '/ai-usage', balance)}
      </ListGroup>

      <ListGroup>
        {row(t('mobile.screen.entry'), 'screen', '/screen')}
        {row(t('mobile.timers.entry'), 'clock', '/timers')}
        {row(t('mobile.wellness.entry'), 'sunrise', '/wellness')}
      </ListGroup>

      <ListGroup>
        {row(t('mobile.more.notifications'), 'bell', '/settings/notifications')}
        {row(t('mobile.more.settings'), 'settings', '/settings')}
      </ListGroup>

      <View style={{ gap: spacing.xs }}>
        <Button
          title={t('mobile.more.signOut')}
          variant="ghost"
          onPress={() => {
            void signOut().then(() => router.replace('/sign-in'));
          }}
        />
        <AppText variant="caption" muted center>
          {t('mobile.more.appVersion', { version })}
        </AppText>
        {/* Required by the CC-BY licence the bundled item artwork ships under. */}
        <AppText variant="caption" muted center>
          {t('mobile.more.iconCredit')}
        </AppText>
      </View>
    </Screen>
  );
}
