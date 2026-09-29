import { View } from 'react-native';
import type { MessageKey, Translator } from '@kitchen/i18n';
import { AppText, Button, Card, EmptyState } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { costOf } from '../../lib/credits';
import { formatQty } from '../../lib/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const NO_PLAN_CARD_MIN_HEIGHT = 270;

function countMessage(
  t: Translator,
  key: MessageKey,
  count: number,
  formattedCount: string,
): string {
  const raw = t(key, { count });
  return raw.replace(String(count), formattedCount);
}

export function NoPlanCard({ onGenerate }: { onGenerate: () => void }) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const planCost = costOf('plan.daily');
  const costText = countMessage(
    t,
    'mobile.home.planCreditCost',
    planCost,
    formatQty(locale, planCost, prefs),
  );

  return (
    <Card style={{ minHeight: NO_PLAN_CARD_MIN_HEIGHT, backgroundColor: colors.surfaceAlt }}>
      <EmptyState
        compact
        illustration="calendar"
        title={t('mobile.home.noPlanTitle')}
        message={t('mobile.home.noPlanBody')}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Button title={t('plans.generate')} size="S" fullWidth={false} onPress={onGenerate} />
        <AppText variant="caption" color="textMuted">
          {costText}
        </AppText>
      </View>
    </Card>
  );
}
