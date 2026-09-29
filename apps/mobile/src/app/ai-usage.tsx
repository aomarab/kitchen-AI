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
import { UsageSummary } from '../features/credits/UsageSummary';
import { useFormat } from '../hooks/useFormat';
import { useCredits } from '../hooks/credits';
import { useAiUsage } from '../hooks/profile';
import { formatQty } from '../lib/format';

/**
 * The household's credit balance and daily AI usage (spec §9.7). Clients see
 * credits, never raw vendor dollars.
 */
export default function CreditsScreen() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const credits = useCredits();
  const usage = useAiUsage();
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
    <Screen
      scroll
      refreshing={credits.isRefetching || usage.isRefetching}
      onRefresh={() => {
        void credits.refetch();
        void usage.refetch();
      }}
      footer={
        balance ? (
          <Button title={t('mobile.credits.buy')} onPress={() => router.push('/buy-credits')} />
        ) : undefined
      }
    >
      <Header title={t('mobile.credits.title')} onBack={() => router.back()} />
      <AppText muted>{t('mobile.credits.subtitle')}</AppText>

      {credits.isLoading ? (
        <LoadingState />
      ) : credits.isError || !balance ? (
        <ErrorState error={credits.error} onRetry={() => void credits.refetch()} />
      ) : (
        <>
          <BalanceTile balance={balance} label={t('mobile.credits.available')} />
          <LowBalanceNotice balance={balance} />
          <ListGroup>
            <ListRow title={t('mobile.credits.free')} value={freeValue} />
            <ListRow title={t('mobile.credits.paid')} value={paidValue} />
          </ListGroup>
          <AppText variant="caption" muted>
            {resetNote}
          </AppText>
          {usage.isLoading ? (
            <LoadingState compact />
          ) : usage.isError || !usage.data ? (
            <ErrorState error={usage.error} compact onRetry={() => void usage.refetch()} />
          ) : (
            <UsageSummary usage={usage.data} />
          )}
        </>
      )}
    </Screen>
  );
}
