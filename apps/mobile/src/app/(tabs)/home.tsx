import { useMemo } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type {
  InventoryItem,
  MealPlanEntry,
  StorageLocation,
  StorageLocationType,
} from '@kitchen/contracts';
import type { MessageKey, Translator } from '@kitchen/i18n';
import {
  AppText,
  Badge,
  Bento,
  Button,
  Card,
  CreditBalance,
  EmptyState,
  FoodIcon,
  Icon,
  IconButton,
  Progress,
  RecipeThumb,
  Screen,
  SectionLabel,
  TabHeader,
  Tile,
} from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useCredits } from '../../hooks/credits';
import { useFormat } from '../../hooks/useFormat';
import { useInventory, useInventorySnapshot, useLocations } from '../../hooks/inventory';
import { usePlans } from '../../hooks/plans';
import { useMe } from '../../hooks/profile';
import { useRecipe } from '../../hooks/recipe';
import { expiryStatus, todayISODate } from '../../lib/expiry';
import {
  formatExpiryLabel,
  formatDaysLeft,
  formatMeasure,
  formatMinutes,
  formatQty,
  formatWeekday,
  itemName,
  locationLabel,
} from '../../lib/format';
import {
  dayPart,
  firstName,
  pantryLine,
  tonightLabel,
  tonightEntry,
  useSoonLabel,
  useSoonPreview,
  weekProgress,
} from '../../lib/home';
import { weekBars } from '../../lib/home-stats';
import { placeAccessibilityLabel, rankPlaces } from '../../lib/kitchen';
import { costOf, totalCredits } from '../../lib/credits';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { WeekStrip } from '../../features/home/WeekStrip';

const ASSISTANT_SEARCH_TARGET_HEIGHT = 52;
const NO_PLAN_CARD_MIN_HEIGHT = 270;
const EMPTY_CREDIT_BALANCE = { freeBalance: 0, paidBalance: 0, freeGrant: 0 };

const PLACE_ILLUSTRATION: Record<
  StorageLocationType,
  'fridge' | 'freezer' | 'pantry' | 'spicerack'
> = {
  fridge: 'fridge',
  freezer: 'freezer',
  pantry: 'pantry',
  spice_rack: 'spicerack',
  other: 'pantry',
};

function dayPartMessageKey(part: ReturnType<typeof dayPart>): MessageKey {
  switch (part) {
    case 'morning':
      return 'mobile.home.dayPart.morning';
    case 'afternoon':
      return 'mobile.home.dayPart.afternoon';
    case 'evening':
      return 'mobile.home.dayPart.evening';
    case 'night':
      return 'mobile.home.dayPart.night';
  }
}

function countMessage(
  t: Translator,
  key: MessageKey,
  count: number,
  formattedCount: string,
): string {
  const raw = t(key, { count });
  return raw.replace(String(count), formattedCount);
}

function minuteMessage(t: Translator, minutes: number, formattedMinutes: string): string {
  return t('mobile.plans.minutesValue', { minutes }).replace(String(minutes), formattedMinutes);
}

function servingsMessage(t: Translator, servings: number, formattedServings: string): string {
  return t('recipe.servings', { count: servings }).replace(String(servings), formattedServings);
}

function miniItemIcon(item: InventoryItem) {
  return {
    label: item.label,
    nameEn: item.ingredient.canonicalNameEn,
    nameAr: item.ingredient.canonicalNameAr,
    category: item.ingredient.category,
  };
}

function AssistantSearchButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useFormat();
  const pressFeedback = usePressFeedback();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      style={{ minHeight: ASSISTANT_SEARCH_TARGET_HEIGHT }}
    >
      <Animated.View
        style={[
          {
            minHeight: ASSISTANT_SEARCH_TARGET_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            backgroundColor: colors.surfaceAlt,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <Icon name="search" size={20} color={colors.textMuted} />
        <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
          {t('mobile.home.greeting')}
        </AppText>
        <Icon name="mic" size={22} color={colors.text} />
      </Animated.View>
    </Pressable>
  );
}

function TonightRecipeCard({
  entry,
  minutesLabel,
  pantryLabel,
  servingsLabel,
  accessibilityLabel,
}: {
  entry: MealPlanEntry;
  minutesLabel: string;
  pantryLabel: string | null;
  servingsLabel: string;
  accessibilityLabel: string;
}) {
  const { t } = useFormat();
  const router = useRouter();
  const openRecipe = () => router.push(`/recipe/${entry.recipe.id}`);
  const cookRecipe = () => router.push(`/recipe/${entry.recipe.id}/cook`);
  const meta = [pantryLabel, servingsLabel].filter(Boolean).join(' · ');

  return (
    <Card
      onPress={openRecipe}
      accessibilityLabel={accessibilityLabel}
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <RecipeThumb
        heroImageUrl={entry.recipe.heroImageUrl}
        dishKey={entry.recipe.difficulty}
        title={entry.recipe.title}
        size={196}
        style={{ width: '100%', height: 196 }}
      />
      <View
        style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 18, gap: 6 }}
      >
        <AppText variant="eyebrow" color="primaryText">
          {t('mobile.home.tonightTitle')} · {minutesLabel}
        </AppText>
        <AppText variant="title">{entry.recipe.title}</AppText>
        {meta ? (
          <AppText variant="caption" color="textMuted">
            {meta}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 10 }}>
          <Button title={t('mobile.home.cook')} size="S" fullWidth={false} onPress={cookRecipe} />
          <Button
            title={t('mobile.home.watch')}
            variant="secondary"
            size="S"
            fullWidth={false}
            onPress={openRecipe}
          />
        </View>
      </View>
    </Card>
  );
}

function NoPlanCard({ onGenerate }: { onGenerate: () => void }) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const planCost = costOf('plan.daily');
  const costText = countMessage(
    t,
    'mobile.home.planCreditCost',
    planCost,
    formatQty(locale, planCost, prefs),
  );

  return (
    <Card style={{ minHeight: NO_PLAN_CARD_MIN_HEIGHT, backgroundColor: colors.surfaceAlt }}>
      <EmptyState
        compact
        illustration="calendar"
        title={t('mobile.home.noPlanTitle')}
        message={t('mobile.home.noPlanBody')}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Button title={t('plans.generate')} size="S" fullWidth={false} onPress={onGenerate} />
        <AppText variant="caption" color="textMuted">
          {costText}
        </AppText>
      </View>
    </Card>
  );
}

function QuickActions({
  hasWeek,
  onGeneratePlan,
}: {
  hasWeek: boolean;
  onGeneratePlan: () => void;
}) {
  const { t } = useFormat();
  const router = useRouter();

  return (
    <Bento variant="quickActions">
      <Tile
        variant="quickAction"
        icon="receipt"
        accessibilityLabel={t('mobile.home.scanReceipt')}
        onPress={() => router.push('/capture?method=receipt')}
      >
        <AppText variant="bodyStrong">{t('mobile.home.scanReceipt')}</AppText>
      </Tile>
      <Tile
        variant="quickAction"
        icon="calendar"
        accessibilityLabel={t('mobile.home.planWeek')}
        onPress={hasWeek ? () => router.push('/plans') : onGeneratePlan}
      >
        <AppText variant="bodyStrong">{t('mobile.home.planWeek')}</AppText>
      </Tile>
      <Tile
        variant="quickAction"
        icon="plus"
        accessibilityLabel={t('mobile.home.quickAdd')}
        onPress={() => router.push('/capture?method=manual')}
      >
        <AppText variant="bodyStrong">{t('mobile.home.quickAdd')}</AppText>
      </Tile>
    </Bento>
  );
}

function expiryBadge(
  t: Translator,
  item: Pick<InventoryItem, 'expiresAt'>,
): { label: string; tone: 'warn' | 'success' | 'danger' | 'muted' } | null {
  const status = expiryStatus(item.expiresAt);
  if (status === 'expired' || status === 'today') {
    return { label: t('mobile.home.statExpiring'), tone: 'danger' };
  }
  if (status === 'soon') return { label: t('mobile.home.statExpiring'), tone: 'warn' };
  if (status === 'ok') return { label: t('mobile.home.freshOk'), tone: 'success' };
  return null;
}

function UseSoonSection({
  items,
  locations,
  countLabel,
  accessibilityLabel,
  onSeeAll,
}: {
  items: readonly InventoryItem[];
  locations: readonly StorageLocation[];
  countLabel: string;
  accessibilityLabel: string;
  onSeeAll: () => void;
}) {
  const { t, locale, prefs, dir } = useFormat();
  const { colors } = useTheme();
  const byLocation = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  return (
    <View style={{ gap: spacing.lg }} accessibilityLabel={accessibilityLabel}>
      <SectionLabel actionLabel={t('mobile.home.seeAll')} onAction={onSeeAll}>
        {t('mobile.home.expiringStrip')}
      </SectionLabel>
      <View key={`use-soon-${dir}`}>
        {items.length === 0 ? (
          <AppText variant="caption" color="textMuted">
            {t('mobile.home.expiringNone')}
          </AppText>
        ) : (
          items.map((item) => {
            const name = itemName(locale, item);
            const location = byLocation.get(item.locationId);
            const quantity = formatMeasure(t, locale, item.quantity, item.unit, prefs);
            const place = location ? locationLabel(t, location) : t('common.loading');
            const meta = `${quantity} · ${place}`;
            const when = formatDaysLeft(t, locale, item.expiresAt, prefs);
            const badge = expiryBadge(t, item);
            return (
              <View
                key={item.id}
                accessible
                accessibilityLabel={[name, meta, badge?.label, when].filter(Boolean).join(', ')}
                style={{
                  minHeight: 76,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.rowline,
                }}
              >
                <FoodIcon item={miniItemIcon(item)} size={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong">{name}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {meta}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {badge ? <Badge tone={badge.tone} label={badge.label} /> : null}
                  {when ? (
                    <AppText variant="small" color="textMuted">
                      {when}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
      {items.length > 0 ? (
        <AppText
          variant="caption"
          color="textMuted"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {countLabel}
        </AppText>
      ) : null}
    </View>
  );
}

function WeekSection({
  plan,
  today,
  progressLabel,
  remainingLabel,
}: {
  plan: { startsOn: string; entries: MealPlanEntry[] };
  today: string;
  progressLabel: string;
  remainingLabel: string;
}) {
  const { t } = useFormat();
  const router = useRouter();
  const bars = weekBars(plan.entries, plan.startsOn);
  const cooked = bars.reduce((sum, bar) => sum + bar.cooked, 0);
  const total = bars.reduce((sum, bar) => sum + bar.planned, 0);
  const value = total === 0 ? 0 : cooked / total;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel actionLabel={t('mobile.home.openPlan')} onAction={() => router.push('/plans')}>
        {t('mobile.home.weekTitle')}
      </SectionLabel>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {progressLabel}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {remainingLabel}
        </AppText>
      </View>
      <Progress value={value} accessibilityLabel={progressLabel} />
      <WeekStrip bars={bars} today={today} />
    </View>
  );
}

function PlaceTile({ place }: { place: ReturnType<typeof rankPlaces>[number] }) {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const label = locationLabel(t, place.location);
  const count = formatQty(locale, place.count, prefs);
  const soon = formatQty(locale, place.soon, prefs);
  const countText = `${count} ${t('mobile.home.glanceItems')}`;
  const soonBadge =
    place.soon > 0 ? countMessage(t, 'mobile.kitchen.soonCount', place.soon, soon) : undefined;

  return (
    <Tile
      variant="place"
      illustration={PLACE_ILLUSTRATION[place.location.type]}
      count={label}
      caption={countText}
      badgeLabel={soonBadge}
      accessibilityLabel={placeAccessibilityLabel({
        t,
        caption: label,
        count: place.count,
        formattedCount: count,
        soon: place.soon,
        formattedSoon: soon,
      })}
      onPress={() => router.push(`/kitchen?locationId=${place.location.id}`)}
    />
  );
}

function KitchenGlanceSection({
  items,
  locations,
  now,
}: {
  items: readonly InventoryItem[];
  locations: readonly StorageLocation[];
  now: Date;
}) {
  const { t } = useFormat();
  const router = useRouter();
  const places = useMemo(
    () => rankPlaces(items, locations, (location) => locationLabel(t, location), now).slice(0, 4),
    [items, locations, now, t],
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionLabel actionLabel={t('mobile.home.seeAll')} onAction={() => router.push('/kitchen')}>
        {t('mobile.home.glanceTitle')}
      </SectionLabel>
      {places.length === 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('mobile.home.glanceEmpty')}
        </AppText>
      ) : (
        <Bento>
          {places.map((place) => (
            <PlaceTile key={place.location.id} place={place} />
          ))}
        </Bento>
      )}
    </View>
  );
}

export default function Home() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const plansQuery = usePlans();
  const expiringQuery = useInventory({ expiringWithinDays: 3, sort: 'expiry' });
  const snapshotQuery = useInventorySnapshot();
  const locationsQuery = useLocations();
  const creditsQuery = useCredits();
  const meQuery = useMe();

  const today = todayISODate();
  const now = useMemo(() => new Date(), []);
  const plan = plansQuery.data?.[0];
  const tonight = useMemo(
    () => (plan ? tonightEntry(plan.entries, today) : undefined),
    [plan, today],
  );
  const recipeQuery = useRecipe(tonight?.recipe.id ?? null, locale);
  const pantry = pantryLine(recipeQuery.data, tonight?.fullyCovered ?? false);
  const week = weekProgress(plan);

  const snapshotItems = snapshotQuery.data?.items ?? [];
  const credits = creditsQuery.data ? totalCredits(creditsQuery.data) : 0;
  const creditsText = formatQty(locale, credits, prefs);
  const greetingName =
    !meQuery.isLoading && !meQuery.isError ? firstName(meQuery.data?.displayName) : null;
  const weekday = formatWeekday(locale, now);
  const dayPartCaption = t(dayPartMessageKey(dayPart(now)), { weekday });
  const expiring = expiringQuery.data?.items ?? [];
  const expiringPreview = useSoonPreview(expiring);
  const expiringCountLabel = countMessage(
    t,
    'mobile.home.itemCount',
    expiring.length,
    formatQty(locale, expiring.length, prefs),
  );
  const useSoonItems = expiringPreview.map((item) => ({
    name: itemName(locale, item),
    expiryLabel: formatExpiryLabel(t, locale, item.expiresAt, prefs),
  }));
  const useSoonAccessibilityLabel = useSoonLabel({
    heading: t('mobile.home.expiringStrip'),
    countLabel: expiringCountLabel,
    emptyLabel: t('mobile.home.expiringNone'),
    items: useSoonItems,
  });
  const mamaLabel = countMessage(t, 'mobile.home.askMamaLabel', credits, creditsText);
  const topUp = () => router.push('/buy-credits');
  const generatePlan = () => router.push('/generate-plan');
  const tonightMinutes =
    tonight !== undefined ? tonight.recipe.prepMinutes + tonight.recipe.cookMinutes : 0;
  const tonightMinutesLabel =
    tonight !== undefined
      ? minuteMessage(t, tonightMinutes, formatMinutes(locale, tonightMinutes, prefs))
      : null;
  const tonightPantryLabel =
    pantry?.key === 'usesYourItems'
      ? countMessage(
          t,
          'mobile.home.usesYourItems',
          pantry.count,
          formatQty(locale, pantry.count, prefs),
        )
      : pantry?.key === 'allInKitchen'
        ? t('mobile.home.allInKitchen')
        : null;
  const tonightServingsLabel = tonight
    ? servingsMessage(t, tonight.recipe.servings, formatQty(locale, tonight.recipe.servings, prefs))
    : null;
  const tonightAccessibilityLabel =
    tonight && tonightMinutesLabel
      ? tonightLabel({
          chip: t('mobile.home.tonightTitle'),
          title: tonight.recipe.title,
          minutes: tonightMinutesLabel,
          pantryLine: tonightPantryLabel,
        })
      : null;
  const weekProgressText = week
    ? t('mobile.home.weekProgress', { cooked: week.cooked, total: week.total })
        .replace(String(week.cooked), formatQty(locale, week.cooked, prefs))
        .replace(String(week.total), formatQty(locale, week.total, prefs))
    : null;
  const weekRemainingText = week
    ? countMessage(
        t,
        'mobile.home.weekRemaining',
        Math.max(0, week.total - week.cooked),
        formatQty(locale, Math.max(0, week.total - week.cooked), prefs),
      )
    : null;

  return (
    <Screen
      scroll
      padded={false}
      tabBar
      refreshing={plansQuery.isRefetching}
      onRefresh={() => {
        void plansQuery.refetch();
        void expiringQuery.refetch();
        void snapshotQuery.refetch();
        void locationsQuery.refetch();
        void creditsQuery.refetch();
      }}
    >
      <TabHeader
        caption={dayPartCaption}
        title={greetingName ? t('mobile.home.greetingLead') : t('mobile.home.greeting')}
        titleAccent={greetingName ?? undefined}
        action={
          <IconButton
            accessibilityLabel={t('mobile.settings.notifications')}
            icon="bell"
            tone="plain"
            onPress={() => router.push('/settings/notifications')}
          />
        }
      />

      <View
        style={{
          paddingHorizontal: spacing.gutter,
          paddingBottom: spacing.gutter,
          gap: spacing.xl,
        }}
      >
        <AssistantSearchButton label={mamaLabel} onPress={() => router.push('/assistant')} />

        {tonight && tonightMinutesLabel && tonightServingsLabel ? (
          <TonightRecipeCard
            entry={tonight}
            minutesLabel={tonightMinutesLabel}
            pantryLabel={tonightPantryLabel}
            servingsLabel={tonightServingsLabel}
            accessibilityLabel={tonightAccessibilityLabel ?? tonight.recipe.title}
          />
        ) : (
          <NoPlanCard onGenerate={generatePlan} />
        )}

        <QuickActions hasWeek={!!week} onGeneratePlan={generatePlan} />

        <UseSoonSection
          items={expiringPreview}
          locations={locationsQuery.data ?? []}
          countLabel={expiringCountLabel}
          accessibilityLabel={useSoonAccessibilityLabel}
          onSeeAll={() => router.push('/kitchen?sort=expiry')}
        />

        {plan && week && weekProgressText && weekRemainingText ? (
          <WeekSection
            plan={plan}
            today={today}
            progressLabel={weekProgressText}
            remainingLabel={weekRemainingText}
          />
        ) : null}

        <KitchenGlanceSection
          items={snapshotItems}
          locations={locationsQuery.data ?? []}
          now={now}
        />

        <CreditBalance balance={creditsQuery.data ?? EMPTY_CREDIT_BALANCE} onTopUp={topUp} />
      </View>
    </Screen>
  );
}
