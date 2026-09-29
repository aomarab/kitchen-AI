import type { CreditPack } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, Button, Card, Illustration } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatQty } from '../../lib/format';
import { spacing } from '../../theme';

export const CREDIT_PACK_CARD_PADDING = 20;
export const CREDIT_PACK_ILLUSTRATION_SIZE = 56;
export const CREDIT_PACK_ACTION_MIN_HEIGHT = 44;

export interface CreditPackCardProps {
  pack: CreditPack;
  price: string;
  freeGrant: number;
  loading: boolean;
  disabled: boolean;
  onBuy: (productId: string) => void;
}

export function CreditPackCard({
  pack,
  price,
  freeGrant,
  loading,
  disabled,
  onBuy,
}: CreditPackCardProps) {
  const { t, locale, prefs } = useFormat();
  const credits = formatQty(locale, pack.credits, prefs);
  const free = formatQty(locale, freeGrant, prefs);
  const creditsLabel = t('mobile.credits.packCredits', { credits });
  const cta = t('mobile.credits.buyCta', { credits });

  return (
    <Card
      style={{
        padding: CREDIT_PACK_CARD_PADDING,
        gap: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <Illustration name="coins" size={CREDIT_PACK_ILLUSTRATION_SIZE} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="title">{creditsLabel}</AppText>
          <AppText variant="caption" muted>
            {t('mobile.credits.packSubtitle', { grant: free })}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <AppText variant="title" style={{ flex: 1, writingDirection: 'ltr' }}>
          {price}
        </AppText>
        <Button
          title={cta}
          fullWidth={false}
          loading={loading}
          disabled={disabled}
          onPress={() => onBuy(pack.productId)}
          style={{ minHeight: CREDIT_PACK_ACTION_MIN_HEIGHT }}
        />
      </View>
    </Card>
  );
}
