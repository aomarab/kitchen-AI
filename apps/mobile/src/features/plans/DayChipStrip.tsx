import { useMemo } from 'react';
import { Animated, Pressable, View } from 'react-native';
import type { MealPlan } from '@kitchen/contracts';
import { AppText } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { todayISODate } from '../../lib/expiry';
import { formatDateL } from '../../lib/format';
import { planWeekDays, type PlanWeekDay } from '../../lib/plans';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const DAY_CELL_WIDTH = 44;
const DAY_CELL_HEIGHT = 60;

export interface DayChipStripProps {
  plan: MealPlan;
  selectedDate: string;
  today?: string;
  onSelectDate: (date: string) => void;
}

function DayCell({
  day,
  onSelectDate,
}: {
  day: PlanWeekDay;
  onSelectDate: (date: string) => void;
}) {
  const { t, locale } = useFormat();
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const date = `${day.date}T00:00:00`;
  const weekday = formatDateL(locale, date, { weekday: 'short' });
  const dayNumber = formatDateL(locale, date, { day: 'numeric' });
  const selected = day.isSelected;
  const textColor = selected ? colors.onFill : day.isToday ? colors.primaryText : colors.text;
  const mutedColor = selected ? colors.onFill : day.isToday ? colors.primaryText : colors.textMuted;
  const label = [
    formatDateL(locale, date, { dateStyle: 'medium' }),
    day.planned ? t('mobile.plans.dayPlanned') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: day.isSelected }}
      onPress={() => onSelectDate(day.date)}
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
            backgroundColor: selected ? colors.primary : 'transparent',
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <AppText variant="small" style={{ color: mutedColor }}>
          {weekday}
        </AppText>
        <AppText variant="bodyStrong" style={{ color: textColor }}>
          {dayNumber}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

export function DayChipStrip({
  plan,
  selectedDate,
  today = todayISODate(),
  onSelectDate,
}: DayChipStripProps) {
  const days = useMemo(() => planWeekDays(plan, selectedDate, today), [plan, selectedDate, today]);

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {days.map((day) => (
        <DayCell key={day.date} day={day} onSelectDate={onSelectDate} />
      ))}
    </View>
  );
}
