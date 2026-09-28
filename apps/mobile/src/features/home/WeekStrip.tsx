import { Animated, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { formatDateL } from '../../lib/format';
import type { DayBar } from '../../lib/home-stats';
import { spacing } from '../../theme';

const DAY_CELL_HEIGHT = 60;
const DAY_CELL_WIDTH = 44;

function DayCell({ bar, today }: { bar: DayBar; today: string }) {
  const { t, locale } = useFormat();
  const router = useRouter();
  const pressFeedback = usePressFeedback();
  const isToday = bar.date === today;
  const date = `${bar.date}T00:00:00`;
  const weekday = formatDateL(locale, date, { weekday: 'short' });
  const day = formatDateL(locale, date, { day: 'numeric' });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatDateL(locale, date, {
        dateStyle: 'medium',
      })}: ${t('mobile.home.dayMeals', { cooked: bar.cooked, planned: bar.planned })}`}
      onPress={() => router.push('/plans')}
      {...pressFeedback.pressHandlers}
      style={{ minHeight: 44, flex: 1, alignItems: 'center' }}
    >
      <Animated.View
        style={[
          {
            width: DAY_CELL_WIDTH,
            minHeight: DAY_CELL_HEIGHT,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <AppText variant="small" color={isToday ? 'primaryText' : 'textMuted'}>
          {weekday}
        </AppText>
        <AppText variant="bodyStrong" color={isToday ? 'primaryText' : 'text'}>
          {day}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

/** Seven fixed day cells for the Home week strip. */
export function WeekStrip({ bars, today }: { bars: readonly DayBar[]; today: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {bars.map((bar) => (
        <DayCell key={bar.date} bar={bar} today={today} />
      ))}
    </View>
  );
}
