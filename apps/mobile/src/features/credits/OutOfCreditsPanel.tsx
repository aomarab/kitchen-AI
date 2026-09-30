import { View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Illustration } from '../../components/Illustration';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';
import { BalanceTile } from './BalanceTile';

export interface OutOfCreditsPanelProps {
  needed?: string | null;
  cost?: string | null;
  balance?: string | null;
  fallbackMessage?: string | null;
  title?: string;
  compact?: boolean;
  onGetMore: () => void;
  onCancel?: () => void;
}

export function OutOfCreditsPanel({
  needed,
  cost,
  balance,
  fallbackMessage,
  title,
  compact = false,
  onGetMore,
  onCancel,
}: OutOfCreditsPanelProps) {
  const { t } = useFormat();
  const message = needed ? t('mobile.credits.needMore', { needed }) : fallbackMessage;

  return (
    <View style={{ gap: compact ? spacing.md : spacing.lg }}>
      {title ? (
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Illustration name="coins" size={compact ? 56 : 72} />
          <AppText variant="title" center accessibilityRole="header">
            {title}
          </AppText>
        </View>
      ) : null}
      {message ? (
        <Banner
          accessibilityRole="alert"
          accessibilityLabel={message}
          icon="alert"
          iconColor="warn"
          message={message}
        />
      ) : null}
      {cost ? (
        <AppText variant="caption" muted>
          {t('mobile.credits.costNotice', { cost })}
        </AppText>
      ) : null}
      {balance ? <BalanceTile formattedTotal={balance} /> : null}
      <Button title={t('mobile.credits.getMore')} onPress={onGetMore} />
      {onCancel ? <Button title={t('common.cancel')} variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}
