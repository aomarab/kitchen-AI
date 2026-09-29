import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { MealPlan, MealPlanEntry, MealSlot, PlanCoverage } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import { AppText, Badge, DirectionalIcon, Icon, RecipeThumb } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { todayISODate } from '../../lib/expiry';
import { formatDateL, formatMinutes, formatQty, localizedName } from '../../lib/format';
import { planEntryStatus } from '../../lib/plan-entry-status';
import { planWeekDays } from '../../lib/plans';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export type PlanView = 'day' | 'week' | 'month';

const SLOT_ORDER: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
const SLOT_KEY: Record<MealSlot, MessageKey> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};
const SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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

function servingsMessage({
  t,
  locale,
  prefs,
  servings,
}: {
  t: ReturnType<typeof useFormat>['t'];
  locale: ReturnType<typeof useFormat>['locale'];
  prefs: ReturnType<typeof useFormat>['prefs'];
  servings: number;
}): string {
  return t('recipe.servings', { count: servings }).replace(
    String(servings),
    formatQty(locale, servings, prefs),
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

function isoFromDate(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
    day.getDate(),
  ).padStart(2, '0')}`;
}

function coverageText({
  entry,
  coverage,
  t,
  locale,
  prefs,
}: {
  entry: MealPlanEntry;
  coverage?: PlanCoverage | null;
  t: ReturnType<typeof useFormat>['t'];
  locale: ReturnType<typeof useFormat>['locale'];
  prefs: ReturnType<typeof useFormat>['prefs'];
}): string {
  if (entry.fullyCovered) return t('mobile.home.allInKitchen');
  const shortfalls = coverage?.shortfalls ?? [];
  if (shortfalls.length === 1) {
    const shortfall = shortfalls[0]!;
    return t('mobile.plans.ingredientMissing', {
      name: localizedName(locale, shortfall.nameEn, shortfall.nameAr),
    });
  }
  const count = shortfalls.length > 0 ? shortfalls.length : 1;
  return t('plans.missingItems', { count }).replace(String(count), formatQty(locale, count, prefs));
}

function PlanDayRow({
  entry,
  today,
  coverage,
  onPress,
}: {
  entry: MealPlanEntry;
  today: string;
  coverage?: PlanCoverage | null;
  onPress: () => void;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const date = `${entry.date}T00:00:00`;
  const isToday = entry.date === today;
  const slot = t(SLOT_KEY[entry.slot]);
  const minutes = entry.recipe.prepMinutes + entry.recipe.cookMinutes;
  const minutesLabel = minuteMessage({ t, locale, prefs, minutes });
  const status = planEntryStatus(entry);
  const statusLabel = t(status.labelKey);
  const shortfall = coverageText({ entry, coverage, t, locale, prefs });
  const isCooked = entry.state === 'cooked';
  const captionTail = isCooked ? statusLabel : isToday ? t('plans.tonight') : shortfall;
  const caption = `${slot} · ${minutesLabel} · ${captionTail}`;
  const accessibilityLabel = `${formatDateL(locale, date, {
    dateStyle: 'medium',
  })}, ${entry.recipe.title}, ${caption}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View
        style={[
          {
            minHeight: 80,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingVertical: spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.rowline,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <View style={{ width: 40, alignItems: 'flex-start', gap: 2 }}>
          <AppText variant="small" color={isToday ? 'primaryText' : 'textMuted'}>
            {formatDateL(locale, date, { weekday: 'short' })}
          </AppText>
          <AppText variant="heading" color={isToday ? 'primaryText' : 'text'}>
            {formatDateL(locale, date, { day: 'numeric' })}
          </AppText>
        </View>
        <RecipeThumb
          heroImageUrl={entry.recipe.heroImageUrl}
          dishKey={entry.recipe.id}
          title={entry.recipe.title}
          size={56}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {entry.recipe.title}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isCooked ? <Icon name="check" size={14} color={colors.success} /> : null}
            <AppText
              variant="caption"
              numberOfLines={1}
              style={{ color: isCooked ? colors.success : colors.textMuted }}
            >
              {caption}
            </AppText>
          </View>
        </View>
        <DirectionalIcon name="chevR" size={18} color={colors.control} />
      </Animated.View>
    </Pressable>
  );
}

function MealEntryRow({
  entry,
  coverage,
  onPress,
}: {
  entry: MealPlanEntry;
  coverage?: PlanCoverage | null;
  onPress: () => void;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const minutes = entry.recipe.prepMinutes + entry.recipe.cookMinutes;
  const minutesLabel = minuteMessage({ t, locale, prefs, minutes });
  const servingsLabel = servingsMessage({ t, locale, prefs, servings: entry.servings });
  const haveLabel = coverageText({ entry, coverage, t, locale, prefs });
  const accessibilityLabel = `${entry.recipe.title}, ${minutesLabel}, ${servingsLabel}, ${haveLabel}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View
        style={[
          {
            minHeight: 92,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.rowline,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <RecipeThumb
          heroImageUrl={entry.recipe.heroImageUrl}
          dishKey={entry.recipe.id}
          title={entry.recipe.title}
          size={72}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {entry.recipe.title}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {minutesLabel} · {servingsLabel}
          </AppText>
          <Badge tone={entry.fullyCovered ? 'success' : 'warn'} label={haveLabel} />
        </View>
        <DirectionalIcon name="chevR" size={18} color={colors.control} />
      </Animated.View>
    </Pressable>
  );
}

function EmptySlotRow() {
  const { t } = useFormat();
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 46,
        borderWidth: StyleSheet.hairlineWidth,
        borderStyle: 'dashed',
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
      }}
    >
      <Icon name="plus" size={18} color={colors.textMuted} />
      <AppText variant="body" muted>
        {t('mobile.plans.nothingPlanned')}
      </AppText>
    </View>
  );
}

function DayAgenda({
  selectedDate,
  entries,
  coverage,
  onOpenEntry,
}: {
  selectedDate: string;
  entries: readonly MealPlanEntry[];
  coverage?: PlanCoverage | null;
  onOpenEntry: (entry: MealPlanEntry) => void;
}) {
  const { t } = useFormat();
  const entriesBySlot = new Map<MealSlot, MealPlanEntry[]>();
  for (const entry of entries) {
    const list = entriesBySlot.get(entry.slot) ?? [];
    list.push(entry);
    entriesBySlot.set(entry.slot, list);
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {SLOTS.map((slot) => {
        const slotEntries = entriesBySlot.get(slot) ?? [];
        return (
          <View key={`${selectedDate}-${slot}`} style={{ gap: spacing.xs }}>
            <AppText variant="label" color="textMuted">
              {t(SLOT_KEY[slot])}
            </AppText>
            {slotEntries.length === 0 ? (
              <EmptySlotRow />
            ) : (
              slotEntries.map((entry) => (
                <MealEntryRow
                  key={entry.id}
                  entry={entry}
                  coverage={coverage}
                  onPress={() => onOpenEntry(entry)}
                />
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

function MonthCell({
  iso,
  has,
  selected,
  isToday,
  onSelectDate,
}: {
  iso: string;
  has: boolean;
  selected: boolean;
  isToday: boolean;
  onSelectDate: (date: string) => void;
}) {
  const { t, locale } = useFormat();
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const label = [
    formatDateL(locale, iso, { weekday: 'long', day: 'numeric', month: 'long' }),
    has ? t('mobile.plans.dayPlanned') : null,
  ]
    .filter(Boolean)
    .join(', ');
  const textColor = selected ? colors.onFill : isToday ? colors.primaryText : colors.text;

  return (
    <Pressable
      onPress={() => onSelectDate(iso)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      {...pressFeedback.pressHandlers}
      style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          {
            width: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? colors.primary : 'transparent',
            borderWidth: isToday && !selected ? StyleSheet.hairlineWidth : 0,
            borderColor: isToday && !selected ? colors.primary : 'transparent',
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <AppText variant="bodyStrong" style={{ color: textColor }}>
          {formatDateL(locale, iso, { day: 'numeric' })}
        </AppText>
        {has ? (
          <View
            style={{
              width: 4,
              height: 4,
              backgroundColor: selected ? colors.onFill : colors.primary,
            }}
          />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export interface PlanBoardProps {
  plan: MealPlan;
  view: PlanView;
  selectedDate: string;
  coverage?: PlanCoverage | null;
  onSelectDate: (date: string) => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
}

export function PlanBoard({
  plan,
  view,
  selectedDate,
  coverage,
  onSelectDate,
  onOpenEntry,
}: PlanBoardProps) {
  const { t, locale } = useFormat();
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
    return (
      <DayAgenda
        selectedDate={selectedDate}
        entries={byDate.get(selectedDate) ?? []}
        coverage={coverage}
        onOpenEntry={onOpenEntry}
      />
    );
  }

  if (view === 'week') {
    const sections = selectedWeekDays
      .map((day) => ({ date: day.date, entries: byDate.get(day.date) ?? [] }))
      .filter((section) => section.entries.length > 0);

    return (
      <View>
        {sections.length === 0 ? (
          <AppText muted>{t('mobile.home.tonightEmpty')}</AppText>
        ) : (
          sections.flatMap((section) =>
            section.entries.map((entry) => (
              <PlanDayRow
                key={entry.id}
                entry={entry}
                today={today}
                coverage={coverage}
                onPress={() => onOpenEntry(entry)}
              />
            )),
          )
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
          {week.map((day, di) =>
            day ? (
              <MonthCell
                key={isoFromDate(day)}
                iso={isoFromDate(day)}
                has={byDate.has(isoFromDate(day))}
                selected={isoFromDate(day) === selectedDate}
                isToday={isoFromDate(day) === today}
                onSelectDate={onSelectDate}
              />
            ) : (
              <View key={di} style={{ flex: 1, aspectRatio: 1 }} />
            ),
          )}
        </View>
      ))}
      <View>
        {dayEntries.map((entry) => (
          <PlanDayRow
            key={entry.id}
            entry={entry}
            today={today}
            coverage={coverage}
            onPress={() => onOpenEntry(entry)}
          />
        ))}
      </View>
    </View>
  );
}
