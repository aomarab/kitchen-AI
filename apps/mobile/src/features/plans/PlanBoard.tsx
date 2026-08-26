import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { MealPlan, MealPlanEntry, MealSlot } from '@kitchen/contracts';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { ListRow } from '../../components/ListRow';
import { useFormat } from '../../hooks/useFormat';
import { formatDateL } from '../../lib/format';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export type PlanView = 'day' | 'week' | 'month';

const SLOT_ORDER: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
const SLOT_KEY: Record<
  MealSlot,
  'plans.breakfast' | 'plans.lunch' | 'plans.dinner' | 'plans.snack'
> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function bySlot(a: MealPlanEntry, b: MealPlanEntry): number {
  return SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
}

function monthMatrix(anchor: Date): Array<Array<Date | null>> {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function EntryRow({ entry, onPress }: { entry: MealPlanEntry; onPress: () => void }) {
  const { t } = useFormat();
  return (
    <ListRow
      title={entry.recipe.title}
      subtitle={t(SLOT_KEY[entry.slot])}
      onPress={onPress}
      showChevron
      trailing={
        <View style={{ gap: 4, alignItems: 'flex-end' }}>
          {entry.state === 'cooked' ? (
            <Badge tone="success" label={t('plans.cooked')} />
          ) : entry.fullyCovered ? (
            <Badge tone="info" label={t('plans.fullyCovered')} />
          ) : (
            <Badge tone="warn" label={t('plans.regenerate')} />
          )}
        </View>
      }
    />
  );
}

export interface PlanBoardProps {
  plan: MealPlan;
  view: PlanView;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
}

/**
 * Renders a meal plan as a day agenda, a week list, or a month calendar. Kept
 * out of the screen so the Plans screen stays thin (spec quality bar).
 */
export function PlanBoard({ plan, view, selectedDate, onSelectDate, onOpenEntry }: PlanBoardProps) {
  const { t, locale } = useFormat();
  const { colors } = useTheme();

  const byDate = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    for (const entry of plan.entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    for (const list of map.values()) list.sort(bySlot);
    return map;
  }, [plan]);

  const weeks = useMemo(() => monthMatrix(parseDate(plan.startsOn)), [plan]);

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        key: i,
        label: formatDateL(locale, new Date(2024, 0, 7 + i, 12), { weekday: 'narrow' }),
      })),
    [locale],
  );

  if (view === 'day') {
    const entries = byDate.get(selectedDate) ?? [];
    return (
      <View style={{ gap: spacing.sm }}>
        <AppText variant="heading">
          {formatDateL(locale, selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}
        </AppText>
        {entries.length === 0 ? (
          <AppText muted>{t('mobile.home.tonightEmpty')}</AppText>
        ) : (
          entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onPress={() => onOpenEntry(entry)} />
          ))
        )}
      </View>
    );
  }

  if (view === 'week') {
    const dates = [...byDate.keys()].sort();
    return (
      <View style={{ gap: spacing.md }}>
        {dates.map((date) => (
          <View key={date} style={{ gap: spacing.sm }}>
            <AppText variant="label" muted>
              {formatDateL(locale, date, { weekday: 'long', day: 'numeric', month: 'short' })}
            </AppText>
            {(byDate.get(date) ?? []).map((entry) => (
              <EntryRow key={entry.id} entry={entry} onPress={() => onOpenEntry(entry)} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  const dayEntries = byDate.get(selectedDate) ?? [];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row' }}>
        {weekdays.map((weekday) => (
          <AppText key={weekday.key} variant="caption" muted center style={{ flex: 1 }}>
            {weekday.label}
          </AppText>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={{ flex: 1, aspectRatio: 1 }} />;
            const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
              day.getDate(),
            ).padStart(2, '0')}`;
            const has = byDate.has(iso);
            const selected = iso === selectedDate;
            return (
              <Pressable
                key={di}
                onPress={() => onSelectDate(iso)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.primary : 'transparent',
                  }}
                >
                  <AppText style={{ color: selected ? colors.onFill : colors.text }}>
                    {formatDateL(locale, iso, { day: 'numeric' })}
                  </AppText>
                </View>
                {has ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: radius.pill,
                      backgroundColor: selected ? colors.primary : colors.accent,
                    }}
                  />
                ) : (
                  <View style={{ width: 5, height: 5 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ gap: spacing.sm }}>
        {dayEntries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} onPress={() => onOpenEntry(entry)} />
        ))}
      </View>
    </View>
  );
}
