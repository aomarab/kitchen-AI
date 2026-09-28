import { useRouter } from 'expo-router';
import {
  Screen,
  Header,
  AppText,
  Button,
  LoadingState,
  ErrorState,
  ListGroup,
  ListRow,
} from '../components';
import { BalanceTile } from '../features/credits/BalanceTile';
import { LowBalanceNotice } from '../features/credits/LowBalanceNotice';
import { useFormat } from '../hooks/useFormat';
import { useCredits } from '../hooks/credits';
import { formatQty } from '../lib/format';

/**
 * The household's credit balance and breakdown (spec §9.7). Clients see
 * credits, never raw vendor dollars.
 */
export default function CreditsScreen() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const credits = useCredits();
  const balance = credits.data;
  const freeValue = balance
    ? t('mobile.credits.packCredits', {
        credits: formatQty(locale, balance.freeBalance, prefs),
      })
    : '';
  const paidValue = balance
    ? t('mobile.credits.packCredits', {
        credits: formatQty(locale, balance.paidBalance, prefs),
      })
    : '';
  const resetNote = balance
    ? t('mobile.credits.resets', { grant: formatQty(locale, balance.freeGrant, prefs) })
    : '';

  return (
    <Screen scroll refreshing={credits.isRefetching} onRefresh={() => void credits.refetch()}>
      <Header title={t('mobile.credits.title')} onBack={() => router.back()} />

      {credits.isLoading ? (
        <LoadingState />
      ) : credits.isError || !balance ? (
        <ErrorState error={credits.error} onRetry={() => void credits.refetch()} />
      ) : (
        <>
          <BalanceTile balance={balance} />
          <LowBalanceNotice balance={balance} />
          <ListGroup>
            <ListRow grouped title={t('mobile.credits.free')} value={freeValue} />
            <ListRow grouped title={t('mobile.credits.paid')} value={paidValue} />
          </ListGroup>
          <AppText variant="caption" muted>
            {resetNote}
          </AppText>
          <Button
            title={t('mobile.credits.getMore')}
            icon="wallet"
            onPress={() => router.push('/buy-credits')}
          />
        </>
      )}
    </Screen>
  );
}
