import { useRouter } from 'expo-router';
import { Screen, Header, Button, CreditBalance, LoadingState, ErrorState } from '../components';
import { useFormat } from '../hooks/useFormat';
import { useCredits } from '../hooks/credits';

/**
 * The household's credit balance (spec §7). Replaces the old raw-USD AI usage
 * view: clients no longer see dollars, only credits — total, the free/paid split
 * and when the free grant resets — with a route to buy more. The `getAiUsage`
 * route still serves operators; only this screen moved off it.
 */
export default function CreditsScreen() {
  const { t } = useFormat();
  const router = useRouter();
  const credits = useCredits();

  return (
    <Screen scroll refreshing={credits.isRefetching} onRefresh={() => void credits.refetch()}>
      <Header title={t('mobile.credits.title')} onBack={() => router.back()} />

      {credits.isLoading ? (
        <LoadingState />
      ) : credits.isError || !credits.data ? (
        <ErrorState error={credits.error} onRetry={() => void credits.refetch()} />
      ) : (
        <>
          <CreditBalance balance={credits.data} />
          <Button
            title={t('mobile.credits.buy')}
            icon="wallet"
            onPress={() => router.push('/buy-credits')}
          />
        </>
      )}
    </Screen>
  );
}
