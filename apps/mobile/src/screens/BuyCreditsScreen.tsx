import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CREDIT_PACKS, creditActionSchema, type CreditAction } from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Button,
  Card,
  CreditBalance,
  LoadingState,
  ErrorState,
  Icon,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import { useCredits } from '../hooks/credits';
import { qk } from '../hooks/keys';
import { buyCredits } from '../lib/purchase';
import { canAfford, creditsShort } from '../lib/credits';
import { formatQty, formatUsd } from '../lib/format';
import { colors, radius, spacing } from '../theme';

/** Read the optional `action` route param — the priced action that sent the user here. */
function actionParam(value: string | string[] | undefined): CreditAction | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = creditActionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Sells credit packs via in-app purchase (spec §6). Shows the current balance,
 * an out-of-credits shortfall when routed from a blocked action, and never tells
 * a paying user their purchase failed: a `pending` outcome is a reassuring "we'll
 * finish shortly", not an error.
 */
export default function BuyCreditsScreen() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ action?: string | string[] }>();
  const action = actionParam(params.action);

  const credits = useCredits();
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [notice, setNotice] = useState<'credited' | 'pending' | null>(null);

  const onBuy = async (productId: string) => {
    setNotice(null);
    setBusyProduct(productId);
    try {
      const outcome = await buyCredits(productId);
      if (outcome.status === 'credited' || outcome.status === 'pending') {
        await qc.invalidateQueries({ queryKey: qk.credits });
        setNotice(outcome.status);
      }
      // `cancelled`: the user backed out — say nothing.
    } finally {
      setBusyProduct(null);
    }
  };

  const balance = credits.data;
  const shortfall =
    balance && action && !canAfford(balance, action) ? creditsShort(balance, action) : 0;

  return (
    <Screen scroll refreshing={credits.isRefetching} onRefresh={() => void credits.refetch()}>
      <Header title={t('mobile.credits.buyTitle')} onBack={() => router.back()} />
      <AppText muted>{t('mobile.credits.buySubtitle')}</AppText>

      {credits.isLoading ? (
        <LoadingState />
      ) : credits.isError || !balance ? (
        <ErrorState error={credits.error} onRetry={() => void credits.refetch()} />
      ) : (
        <>
          <CreditBalance balance={balance} />

          {shortfall > 0 ? (
            <Card
              tone="alt"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            >
              <Icon name="warning" size={20} color={colors.warn} />
              <AppText variant="bodyStrong" style={{ flex: 1 }} accessibilityRole="alert">
                {t('mobile.credits.needMore', { needed: formatQty(locale, shortfall, prefs) })}
              </AppText>
            </Card>
          ) : null}

          {notice ? (
            <Card tone={notice === 'credited' ? 'primary' : 'surface'} style={{ gap: spacing.xs }}>
              <AppText variant="bodyStrong" color={notice === 'credited' ? 'success' : 'text'}>
                {t(`mobile.credits.${notice}`)}
              </AppText>
            </Card>
          ) : null}

          <View style={{ gap: spacing.md }}>
            {CREDIT_PACKS.map((pack) => (
              <Card key={pack.productId} style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.primarySoft,
                    }}
                  >
                    <Icon name="sparkles" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="heading">
                      {t('mobile.credits.packCredits', {
                        credits: formatQty(locale, pack.credits, prefs),
                      })}
                    </AppText>
                    <AppText variant="caption" muted>
                      {formatUsd(locale, pack.priceUsd, prefs)}
                    </AppText>
                  </View>
                </View>
                <Button
                  title={t('mobile.credits.buyCta', {
                    credits: formatQty(locale, pack.credits, prefs),
                  })}
                  icon="wallet"
                  loading={busyProduct === pack.productId}
                  disabled={busyProduct !== null}
                  onPress={() => void onBuy(pack.productId)}
                />
              </Card>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
