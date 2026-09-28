import { useRouter } from 'expo-router';
import {
  Screen,
  Header,
  Button,
  LoadingState,
  ErrorState,
  ListGroup,
  ListRow,
} from '../components';
import { BalanceTile } from '../features/credits/BalanceTile';
import { usageCreditsFromUsd } from '../features/credits/usage-summary';
import { useFormat } from '../hooks/useFormat';
import { useCredits } from '../hooks/credits';
import { useAiUsage } from '../hooks/profile';
import { formatDateL, formatQty } from '../lib/format';

/**
 * The household's credit balance and AI usage (spec §9.7). Clients see the
 * usage route as credits, never raw vendor dollars.
 */
export default function CreditsScreen() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const credits = useCredits();
  const usage = useAiUsage();
  const usageDate = usage.data
    ? formatDateL(locale, usage.data.day, { month: 'short', day: 'numeric' })
    : '';
  const usageCredits = usage.data
    ? t('mobile.credits.packCredits', {
        credits: formatQty(locale, usageCreditsFromUsd(usage.data.spentUsd), prefs),
      })
    : '';
  const usageSubtitle = usage.data
    ? `${usageDate} · ${t('mobile.aiUsage.callsCount', { count: usage.data.callCount })}`
    : '';

  return (
    <Screen
      scroll
      refreshing={credits.isRefetching || usage.isRefetching}
      onRefresh={() => {
        void credits.refetch();
        void usage.refetch();
      }}
    >
      <Header title={t('mobile.credits.title')} onBack={() => router.back()} />

      {credits.isLoading ? (
        <LoadingState />
      ) : credits.isError || !credits.data ? (
        <ErrorState error={credits.error} onRetry={() => void credits.refetch()} />
      ) : (
        <>
          <BalanceTile balance={credits.data} />
          <Button
            title={t('mobile.credits.getMore')}
            icon="wallet"
            onPress={() => router.push('/buy-credits')}
          />
          {usage.isLoading ? (
            <LoadingState compact />
          ) : usage.isError || !usage.data ? (
            <ErrorState error={usage.error} compact onRetry={() => void usage.refetch()} />
          ) : (
            <ListGroup>
              <ListRow
                grouped
                icon="sparkles"
                title={t('mobile.aiUsage.today')}
                subtitle={usageSubtitle}
                value={usageCredits}
              />
            </ListGroup>
          )}
        </>
      )}
    </Screen>
  );
}
