import type { AiUsageSummary } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, Progress } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { usageCreditsForDisplay, usageCreditsFromUsd } from '../../lib/credits';
import { formatQty } from '../../lib/format';
import { spacing } from '../../theme';

export interface UsageSummaryProps {
  usage: AiUsageSummary;
}

export function UsageSummary({ usage }: UsageSummaryProps) {
  const { t, locale, prefs } = useFormat();
  const spent = usageCreditsFromUsd(usage.spentUsd);
  const budget = usageCreditsFromUsd(usage.budgetUsd);
  const spentLabel = formatQty(locale, usageCreditsForDisplay(spent), prefs);
  const budgetLabel = formatQty(locale, usageCreditsForDisplay(budget), prefs);
  const ratio = usage.budgetUsd > 0 ? usage.spentUsd / usage.budgetUsd : 0;

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="eyebrow" muted>
        {t('mobile.aiUsage.today')}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
        <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1 }}>
          {t('mobile.aiUsage.spentOfBudget', { spent: spentLabel, budget: budgetLabel })}
        </AppText>
        <AppText variant="caption" muted>
          {t('mobile.aiUsage.callsCount', { count: usage.callCount })}
        </AppText>
      </View>
      <Progress
        value={ratio}
        accessibilityLabel={t('mobile.aiUsage.spentOfBudget', {
          spent: spentLabel,
          budget: budgetLabel,
        })}
      />
    </View>
  );
}
