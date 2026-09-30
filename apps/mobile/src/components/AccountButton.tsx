import { useRouter } from 'expo-router';
import { RoundButton } from './RoundButton';
import { useFormat } from '../hooks/useFormat';
import { initialOf } from '../lib/initial';
import { useAuthStore } from '../stores/auth';

/**
 * The avatar at the trailing end of every tab header (spec §4.2): a 36pt
 * `soft` circle with the user's initial inside a 44pt target. It is the only
 * way to Account, which holds everything the retired More tab held.
 */
export function AccountButton() {
  const { t } = useFormat();
  const router = useRouter();
  const initial = initialOf(useAuthStore((state) => state.user?.displayName));
  return (
    <RoundButton
      size={36}
      tone="soft"
      label={initial ?? undefined}
      icon={initial ? undefined : 'user'}
      accessibilityLabel={t('mobile.account.title')}
      onPress={() => router.push('/account')}
    />
  );
}
