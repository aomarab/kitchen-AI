import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, AppText, ListRow, Card, Button, Icon } from '../../components';
import type { IconName } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useAuthStore } from '../../stores/auth';
import { colors, spacing } from '../../theme';

export default function More() {
  const { t } = useFormat();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const row = (title: string, icon: IconName, href: string) => (
    <ListRow
      title={title}
      leading={<Icon name={icon} size={20} color={colors.textMuted} />}
      showChevron
      onPress={() => router.push(href)}
    />
  );

  return (
    <Screen scroll>
      <AppText variant="title">{t('mobile.more.title')}</AppText>

      {user ? (
        <Card>
          <AppText variant="heading">{user.displayName}</AppText>
          <AppText variant="caption" muted>
            {user.email}
          </AppText>
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {row(t('mobile.more.shopping'), 'basket', '/shopping')}
        {row(t('mobile.more.household'), 'household', '/settings/household')}
        {row(t('mobile.more.profile'), 'user', '/profile')}
        {row(t('mobile.more.settings'), 'settings', '/settings')}
        {row(t('mobile.more.credits'), 'wallet', '/ai-usage')}
      </View>

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
    </Screen>
  );
}
