import { View } from 'react-native';
import { AppText, Button, Icon } from '../../components';
import type { TileSpan } from '../../components/Tile';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface QuestionTileProps {
  span?: TileSpan;
  name: string;
  onYes: () => void;
  onNo: () => void;
}

/** Low-confidence prompt row. */
export function QuestionTile({ name, onYes, onNo }: QuestionTileProps) {
  const { t } = useFormat();
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 120,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Icon name="leaf" size={22} color={colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">{t('mobile.review.isThis', { name })}</AppText>
          <AppText variant="caption" muted>
            {t('mobile.review.notSure')}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          title={t('mobile.review.no')}
          variant="secondary"
          fullWidth={false}
          style={{ flex: 1, flexBasis: 0 }}
          onPress={onNo}
        />
        <Button
          title={t('mobile.review.yes')}
          variant="inverse"
          fullWidth={false}
          style={{ flex: 1, flexBasis: 0 }}
          onPress={onYes}
        />
      </View>
    </View>
  );
}
