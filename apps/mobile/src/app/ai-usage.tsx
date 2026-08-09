import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header, AppText, Card, LoadingState, ErrorState } from '../components';
import { useFormat } from '../hooks/useFormat';
import { useAiUsage } from '../hooks/profile';
import { formatUsd, formatQty, formatDateWithHijri } from '../lib/format';
import { colors, radius, spacing } from '../theme';

export default function AiUsage() {
  const { t, locale, prefs, showHijri } = useFormat();
  const router = useRouter();
  const usage = useAiUsage();

  return (
    <Screen scroll refreshing={usage.isRefetching} onRefresh={() => void usage.refetch()}>
      <Header title={t('mobile.aiUsage.title')} onBack={() => router.back()} />

      {usage.isLoading ? (
        <LoadingState />
      ) : usage.isError || !usage.data ? (
        <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
      ) : (
        <Card tone="primary" style={{ gap: spacing.md }}>
          <AppText variant="label" color="primary">
            {t('mobile.aiUsage.today')}
          </AppText>
          <AppText variant="title">
            {t('mobile.aiUsage.spentOfBudget', {
              spent: formatUsd(locale, usage.data.spentUsd, prefs),
              budget: formatUsd(locale, usage.data.budgetUsd, prefs),
            })}
          </AppText>
          <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surface }}>
            <View
              style={{
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: colors.primary,
                width: `${Math.round(
                  Math.min(1, usage.data.budgetUsd > 0 ? usage.data.spentUsd / usage.data.budgetUsd : 0) * 100,
                )}%`,
              }}
            />
          </View>
          <AppText variant="caption" muted>
            {t('mobile.aiUsage.callsCount', { count: formatQty(locale, usage.data.callCount, prefs) })}
          </AppText>
          <AppText variant="caption" muted>
            {formatDateWithHijri(locale, usage.data.day, showHijri)}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}
