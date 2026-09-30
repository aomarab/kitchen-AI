import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CREDIT_PACKS, creditActionSchema, type CreditAction } from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Card,
  LoadingState,
  ErrorState,
  Icon,
  SectionLabel,
} from '../components';
import { BalanceTile } from '../features/credits/BalanceTile';
import { CreditPackCard } from '../features/credits/CreditPackCard';
import { LowBalanceNotice } from '../features/credits/LowBalanceNotice';
import { useFormat } from '../hooks/useFormat';
import { useCredits, usePackPrices } from '../hooks/credits';
import { qk } from '../hooks/keys';
import { canAfford, costOf, creditsShort, displayPrice } from '../lib/credits';
import { formatQty, formatUsd } from '../lib/format';
import { buyCredits } from '../lib/purchase';
import { useToastStore } from '../stores/toast';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

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
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const showToast = useToastStore((state) => state.show);
  const params = useLocalSearchParams<{ action?: string | string[] }>();
  const action = actionParam(params.action);

  const credits = useCredits();
  const packPrices = usePackPrices();
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [notice, setNotice] = useState<'pending' | 'failed' | null>(null);

  const onBuy = async (productId: string) => {
    setNotice(null);
    setBusyProduct(productId);
    try {
      const outcome = await buyCredits(productId);
      if (outcome.status === 'credited') {
        await qc.invalidateQueries({ queryKey: qk.credits });
        showToast({ message: t('mobile.credits.credited') });
      } else if (outcome.status === 'pending') {
        await qc.invalidateQueries({ queryKey: qk.credits });
        setNotice('pending');
      }
      // `cancelled`: the user backed out — say nothing.
    } catch {
      // Nothing was charged to get here: either the intent call failed or the
      // store sheet never opened (no storefront for this build, no network).
      // `buyCredits` already converts every post-charge failure into `pending`,
      // so this branch cannot swallow a real purchase. Without it the button
      // just stops spinning and the screen says nothing at all.
      setNotice('failed');
    } finally {
      setBusyProduct(null);
    }
  };

  const balance = credits.data;
  const shortfall =
    balance && action && !canAfford(balance, action) ? creditsShort(balance, action) : 0;
  const cost = action ? costOf(action) : 0;

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
          <BalanceTile balance={balance} />
          <LowBalanceNotice balance={balance} />

          {shortfall > 0 ? (
            <Card style={{ gap: spacing.md, backgroundColor: colors.surfaceAlt }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="alert" size={18} color={colors.warn} />
                <AppText style={{ flex: 1 }} accessibilityRole="alert">
                  {t('mobile.credits.needMore', {
                    needed: formatQty(locale, shortfall, prefs),
                  })}
                </AppText>
              </View>
              <AppText variant="caption" muted>
                {t('mobile.credits.costNotice', {
                  cost: formatQty(locale, cost, prefs),
                })}
              </AppText>
            </Card>
          ) : null}

          {notice ? (
            <Card style={{ gap: spacing.xs }}>
              <AppText
                variant="bodyStrong"
                color={notice === 'failed' ? 'danger' : 'text'}
                accessibilityRole="alert"
              >
                {t(`mobile.credits.${notice}`)}
              </AppText>
            </Card>
          ) : null}

          <SectionLabel>{t('mobile.credits.packs')}</SectionLabel>
          <>
            {CREDIT_PACKS.map((pack) => {
              const price = displayPrice(
                packPrices.data?.[pack.productId] ?? null,
                formatUsd(locale, pack.priceUsd, prefs),
              );
              return (
                <CreditPackCard
                  key={pack.productId}
                  pack={pack}
                  price={price}
                  freeGrant={balance.freeGrant}
                  loading={busyProduct === pack.productId}
                  disabled={busyProduct !== null}
                  onBuy={(productId) => void onBuy(productId)}
                />
              );
            })}
          </>
        </>
      )}
    </Screen>
  );
}
