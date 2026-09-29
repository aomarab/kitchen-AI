import { Bento, Tile } from '../../components';
import { useFormat } from '../../hooks/useFormat';

export function QuickActions({
  onScanReceipt,
  onPlanWeek,
  onQuickAdd,
}: {
  onScanReceipt: () => void;
  onPlanWeek: () => void;
  onQuickAdd: () => void;
}) {
  const { t } = useFormat();

  return (
    <Bento variant="quickActions">
      <Tile
        variant="quickAction"
        icon="receipt"
        count={t('mobile.home.scanReceipt')}
        accessibilityLabel={t('mobile.home.scanReceipt')}
        onPress={onScanReceipt}
      />
      <Tile
        variant="quickAction"
        icon="calendar"
        count={t('mobile.home.planWeek')}
        accessibilityLabel={t('mobile.home.planWeek')}
        onPress={onPlanWeek}
      />
      <Tile
        variant="quickAction"
        icon="plus"
        count={t('mobile.home.quickAdd')}
        accessibilityLabel={t('mobile.home.quickAdd')}
        onPress={onQuickAdd}
      />
    </Bento>
  );
}
