import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { MealPlan, MealPlanEntry, MealSlot } from '@kitchen/contracts';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { DirectionalIcon } from '../../components/DirectionalIcon';
import { ListGroup } from '../../components/ListGroup';
import { RecipeThumb } from '../../components/RecipeThumb';
import { useFormat } from '../../hooks/useFormat';
import { todayISODate } from '../../lib/expiry';
import { formatDateL, formatMinutes } from '../../lib/format';
import { planEntryStatus } from '../../lib/plan-entry-status';
import { planWeekDays } from '../../lib/plans';
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

function minuteMessage({
  t,
  locale,
  prefs,
  minutes,
}: {
  t: ReturnType<typeof useFormat>['t'];
  locale: ReturnType<typeof useFormat>['locale'];
  prefs: ReturnType<typeof useFormat>['prefs'];
  minutes: number;
}): string {
  return t('mobile.plans.minutesValue', { minutes }).replace(
    String(minutes),
    formatMinutes(locale, minutes, prefs),
  );
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
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const slot = t(SLOT_KEY[entry.slot]);
  const minutes = entry.recipe.prepMinutes + entry.recipe.cookMinutes;
  const minutesLabel = minuteMessage({ t, locale, prefs, minutes });
  const status = planEntryStatus(entry);
  const statusLabel = t(status.labelKey);
  const caption = `${slot} · ${minutesLabel}`;
  const accessibilityLabel = `${slot}, ${entry.recipe.title}, ${minutesLabel}, ${statusLabel}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          minHeight: 96,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        <RecipeThumb
          heroImageUrl={entry.recipe.heroImageUrl}
          dishKey={entry.recipe.id}
          title={entry.recipe.title}
          style={{ width: 64, height: 64, borderRadius: radius.md }}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText variant="caption" muted numberOfLines={1}>
            {caption}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {entry.recipe.title}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Badge tone={status.tone} label={statusLabel} />
          <DirectionalIcon name="chevron" size={20} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

function DaySection({
  date,
  entries,
  onOpenEntry,
}: {
  date: string;
  entries: readonly MealPlanEntry[];
  onOpenEntry: (entry: MealPlanEntry) => void;
}) {
  const { t, locale } = useFormat();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading">
        {formatDateL(locale, date, { weekday: 'long', day: 'numeric', month: 'long' })}
      </AppText>
      {entries.length === 0 ? (
        <AppText muted>{t('mobile.home.tonightEmpty')}</AppText>
      ) : (
        <ListGroup>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onPress={() => onOpenEntry(entry)} />
          ))}
        </ListGroup>
      )}
    </View>
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
  const today = todayISODate();

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

  const selectedWeekDays = useMemo(
    () => planWeekDays(plan, selectedDate, today),
    [plan, selectedDate, today],
  );

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
    return <DaySection date={selectedDate} entries={entries} onOpenEntry={onOpenEntry} />;
  }

  if (view === 'week') {
    const sections = selectedWeekDays
      .map((day) => ({ date: day.date, entries: byDate.get(day.date) ?? [] }))
      .filter((section) => section.entries.length > 0);

    return (
      <View style={{ gap: spacing.md }}>
        {sections.length === 0 ? (
          <AppText muted>{t('mobile.home.tonightEmpty')}</AppText>
        ) : (
          sections.map((section) => (
            <DaySection
              key={section.date}
              date={section.date}
              entries={section.entries}
              onOpenEntry={onOpenEntry}
            />
          ))
        )}
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
            const isToday = iso === today;
            const label = [
              formatDateL(locale, iso, { weekday: 'long', day: 'numeric', month: 'long' }),
              has ? t('mobile.plans.dayPlanned') : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <Pressable
                key={di}
                onPress={() => onSelectDate(iso)}
                accessibilityRole="button"
                accessibilityLabel={label}
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
                    backgroundColor: isToday
                      ? colors.primary
                      : selected
                        ? colors.text
                        : 'transparent',
                    borderWidth: selected && !isToday ? 1 : 0,
                    borderColor: selected && !isToday ? colors.text : 'transparent',
                  }}
                >
                  <AppText
                    style={{ color: isToday ? colors.onFill : selected ? colors.bg : colors.text }}
                  >
                    {formatDateL(locale, iso, { day: 'numeric' })}
                  </AppText>
                </View>
                {has ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: radius.pill,
                      backgroundColor: colors.primary,
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
