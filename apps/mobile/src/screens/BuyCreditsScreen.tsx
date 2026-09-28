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
  LoadingState,
  ErrorState,
  Icon,
  Bento,
  Tile,
} from '../components';
import { BalanceTile } from '../features/credits/BalanceTile';
import { LowBalanceNotice } from '../features/credits/LowBalanceNotice';
import { useFormat } from '../hooks/useFormat';
import { useCredits, usePackPrices } from '../hooks/credits';
import { qk } from '../hooks/keys';
import { buyCredits } from '../lib/purchase';
import { canAfford, creditsShort, displayPrice } from '../lib/credits';
import { formatQty, formatUsd } from '../lib/format';
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
  const params = useLocalSearchParams<{ action?: string | string[] }>();
  const action = actionParam(params.action);

  const credits = useCredits();
  const packPrices = usePackPrices();
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(CREDIT_PACKS[0]?.productId ?? null);
  const [notice, setNotice] = useState<'credited' | 'pending' | 'failed' | null>(null);

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
  const selectedPack =
    CREDIT_PACKS.find((pack) => pack.productId === selectedProductId) ?? CREDIT_PACKS[0] ?? null;
  const busyPack = busyProduct
    ? (CREDIT_PACKS.find((pack) => pack.productId === busyProduct) ?? null)
    : null;
  const ctaPack = busyPack ?? selectedPack;
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
          <BalanceTile balance={balance} />
          <LowBalanceNotice balance={balance} />

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
              <AppText
                variant="bodyStrong"
                color={notice === 'credited' ? 'success' : notice === 'failed' ? 'danger' : 'text'}
                accessibilityRole="alert"
              >
                {t(`mobile.credits.${notice}`)}
              </AppText>
            </Card>
          ) : null}

          <Bento>
            {CREDIT_PACKS.map((pack) => {
              const selected = selectedPack?.productId === pack.productId;
              const creditsLabel = t('mobile.credits.packCredits', {
                credits: formatQty(locale, pack.credits, prefs),
              });
              const price = displayPrice(
                packPrices.data?.[pack.productId] ?? null,
                formatUsd(locale, pack.priceUsd, prefs),
              );
              return (
                <Tile
                  key={pack.productId}
                  span={2}
                  icon="sparkles"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: busyProduct !== null }}
                  accessibilityLabel={`${creditsLabel}, ${price}`}
                  onPress={() => {
                    if (busyProduct === null) setSelectedProductId(pack.productId);
                  }}
                  style={selected ? { borderWidth: 2, borderColor: colors.primary } : undefined}
                >
                  <View style={{ gap: spacing.xs }}>
                    <AppText variant="numeral">{formatQty(locale, pack.credits, prefs)}</AppText>
                    <AppText variant="caption" muted style={{ writingDirection: 'ltr' }}>
                      {price}
                    </AppText>
                  </View>
                </Tile>
              );
            })}
          </Bento>

          {ctaPack ? (
            <Button
              title={t('mobile.credits.buyCta', {
                credits: formatQty(locale, ctaPack.credits, prefs),
              })}
              icon="wallet"
              loading={busyProduct !== null}
              disabled={busyProduct !== null}
              onPress={() => void onBuy(ctaPack.productId)}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
