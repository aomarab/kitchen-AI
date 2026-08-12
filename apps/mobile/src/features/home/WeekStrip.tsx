import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatDateL, formatQty } from '../../lib/format';
import type { DayBar } from '../../lib/home-stats';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const TRACK = 56;

/**
 * The week ahead as seven columns: how much is planned each day, and how much
 * of it has been cooked.
 *
 * The column count is fixed at seven whatever the data says, so the card
 * reserves its height on the very first paint and nothing below it jumps when
 * the plan finishes loading. Bars carry no meaning on their own — every column
 * announces its real numbers to a screen reader, and the day letters underneath
 * are the visible axis.
 */
export function WeekStrip({ bars, today }: { bars: readonly DayBar[]; today: string }) {
  const { t, locale, prefs } = useFormat();
  const { colors, tintFor } = useTheme();
  const router = useRouter();

  const busiest = Math.max(1, ...bars.map((bar) => bar.planned));

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {bars.map((bar) => {
        const height = (bar.planned / busiest) * TRACK;
        const cooked = bar.planned === 0 ? 0 : (bar.cooked / bar.planned) * height;
        const isToday = bar.date === today;
        const label = formatDateL(locale, `${bar.date}T00:00:00`, {
          weekday: 'short',
        });
        return (
          <Pressable
            key={bar.date}
            accessibilityRole="button"
            accessibilityLabel={`${formatDateL(locale, `${bar.date}T00:00:00`, {
              dateStyle: 'medium',
            })}: ${t('mobile.home.dayMeals', { cooked: bar.cooked, planned: bar.planned })}`}
            onPress={() => router.push('/plans')}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              gap: spacing.xs,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View
              style={{
                height: TRACK,
                width: '100%',
                justifyContent: 'flex-end',
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.sm,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height,
                  backgroundColor: tintFor(0).bg,
                  justifyContent: 'flex-end',
                }}
              >
                <View style={{ height: cooked, backgroundColor: colors.primary }} />
              </View>
            </View>
            <AppText variant="caption" muted={!isToday} numberOfLines={1}>
              {label}
            </AppText>
            <AppText variant="caption" muted={!isToday}>
              {formatQty(locale, bar.planned, prefs)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
