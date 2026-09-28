import { useMemo } from 'react';
import { View } from 'react-native';
import type { MealPlan } from '@kitchen/contracts';
import { AppText, Chip } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { todayISODate } from '../../lib/expiry';
import { formatDateL } from '../../lib/format';
import { planWeekDays } from '../../lib/plans';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface DayChipStripProps {
  plan: MealPlan;
  selectedDate: string;
  today?: string;
  onSelectDate: (date: string) => void;
}

export function DayChipStrip({
  plan,
  selectedDate,
  today = todayISODate(),
  onSelectDate,
}: DayChipStripProps) {
  const { t, locale } = useFormat();
  const { colors } = useTheme();
  const days = useMemo(() => planWeekDays(plan, selectedDate, today), [plan, selectedDate, today]);

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {days.map((day) => {
        const primary = day.isToday;
        const labelColor = primary ? colors.onFill : day.isSelected ? colors.bg : colors.text;
        const dotColor = primary ? colors.onFill : colors.primary;
        const weekday = formatDateL(locale, day.date, { weekday: 'narrow' });
        const dayNumber = formatDateL(locale, day.date, { day: 'numeric' });
        const planned = day.planned ? t('mobile.plans.dayPlanned') : null;
        const label = [weekday, dayNumber, planned].filter(Boolean).join(', ');

        return (
          <View key={day.date} style={{ flex: 1, minWidth: 0 }}>
            <Chip
              label={label}
              accessibilityLabel={label}
              accessibilityState={{ selected: day.isSelected }}
              selected={day.isSelected}
              tone={primary ? 'primary' : 'default'}
              onPress={() => onSelectDate(day.date)}
              style={{ minHeight: 56, paddingHorizontal: spacing.xs, alignItems: 'center' }}
            >
              <View style={{ alignItems: 'center', gap: 2 }}>
                <AppText variant="caption" style={{ color: labelColor }}>
                  {weekday}
                </AppText>
                <AppText variant="bodyStrong" style={{ color: labelColor }}>
                  {dayNumber}
                </AppText>
                {day.planned ? (
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: radius.pill,
                      backgroundColor: dotColor,
                    }}
                  />
                ) : (
                  <View style={{ width: 6, height: 6 }} />
                )}
              </View>
            </Chip>
          </View>
        );
      })}
    </View>
  );
}
