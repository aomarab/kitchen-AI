import { Pressable, View } from 'react-native';
import { AppText, OrbMascot } from '../../components';
import type { TileSpan } from '../../components/Tile';
import { useFormat } from '../../hooks/useFormat';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface QuestionTileProps {
  span?: TileSpan;
  name: string;
  onYes: () => void;
  onNo: () => void;
}

function AnswerButton({
  label,
  filled,
  onPress,
}: {
  label: string;
  filled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flex: 1,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.bg,
        backgroundColor: filled ? colors.bg : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <AppText variant="button" style={{ color: filled ? colors.text : colors.bg }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Inverted low-confidence prompt tile, with no coral brand colour inside. */
export function QuestionTile({ name, onYes, onNo }: QuestionTileProps) {
  const { t } = useFormat();
  const { colors, isDark, shadow } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 140,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.text,
        backgroundColor: colors.text,
        padding: spacing.md,
        gap: spacing.md,
        ...(isDark ? null : shadow.card),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <OrbMascot size={24} state="idle" />
        <AppText variant="caption" style={{ color: colors.bg }}>
          {t('mobile.review.notSure')}
        </AppText>
      </View>
      <AppText variant="bodyStrong" style={{ color: colors.bg }}>
        {t('mobile.review.isThis', { name })}
      </AppText>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <AnswerButton label={t('mobile.review.yes')} filled onPress={onYes} />
        <AnswerButton label={t('mobile.review.no')} onPress={onNo} />
      </View>
    </View>
  );
}
