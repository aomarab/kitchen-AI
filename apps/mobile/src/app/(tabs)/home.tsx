import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { MessageKey, Translator } from '@kitchen/i18n';
import { CreditBalance, IconButton, Screen, TabHeader } from '../../components';
import { AssistantModeShortcuts } from '../../features/home/AssistantModeShortcuts';
import { AssistantSearchButton } from '../../features/home/AssistantSearchButton';
import { KitchenGlanceSection } from '../../features/home/KitchenGlance';
import { NoPlanCard } from '../../features/home/NoPlanCard';
import { QuickActions } from '../../features/home/QuickActions';
import { TonightRecipeCard } from '../../features/home/TonightRecipeCard';
import { UseSoonSection } from '../../features/home/UseSoonSection';
import { WeekSection } from '../../features/home/WeekSection';
import { useCredits } from '../../hooks/credits';
import { useFormat } from '../../hooks/useFormat';
import { useInventory, useInventorySnapshot, useLocations } from '../../hooks/inventory';
import { usePlans } from '../../hooks/plans';
import { useMe } from '../../hooks/profile';
import { useRecipe } from '../../hooks/recipe';
import { todayISODate } from '../../lib/expiry';
import {
  formatExpiryLabel,
  formatMinutes,
  formatQty,
  formatWeekday,
  itemName,
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
import { totalCredits } from '../../lib/credits';
import type { AssistantMode } from '../../lib/assistant/mode';
import { spacing } from '../../theme';

const EMPTY_CREDIT_BALANCE = { freeBalance: 0, paidBalance: 0, freeGrant: 0 };

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
  const openAssistant = () => router.push('/assistant');
  const openAssistantMode = (mode: AssistantMode) => router.push(`/assistant?mode=${mode}`);
  const openNotifications = () => router.push('/settings/notifications');
  const openRecipe = (recipeId: string) => router.push(`/recipe/${recipeId}`);
  const cookRecipe = (recipeId: string) => router.push(`/recipe/${recipeId}/cook`);
  const watchRecipe = (recipeId: string) => router.push(`/recipe/${recipeId}?tab=videos`);
  const scanReceipt = () => router.push('/capture?method=receipt');
  const openPlan = () => router.push('/plans');
  const planWeek = week ? openPlan : generatePlan;
  const quickAdd = () => router.push('/capture?method=manual');
  const openUseSoon = () => router.push('/kitchen?sort=expiry');
  const openKitchen = () => router.push('/kitchen');
  const openPlace = (locationId: string) => router.push(`/kitchen?locationId=${locationId}`);
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
            onPress={openNotifications}
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
        <View style={{ gap: spacing.md }}>
          <AssistantSearchButton label={mamaLabel} onPress={openAssistant} />
          <AssistantModeShortcuts onOpen={openAssistantMode} />
        </View>

        {tonight && tonightMinutesLabel && tonightServingsLabel ? (
          <TonightRecipeCard
            entry={tonight}
            minutesLabel={tonightMinutesLabel}
            pantryLabel={tonightPantryLabel}
            servingsLabel={tonightServingsLabel}
            accessibilityLabel={tonightAccessibilityLabel ?? tonight.recipe.title}
            onOpenRecipe={() => openRecipe(tonight.recipe.id)}
            onCookRecipe={() => cookRecipe(tonight.recipe.id)}
            onWatchRecipe={() => watchRecipe(tonight.recipe.id)}
          />
        ) : (
          <NoPlanCard onGenerate={generatePlan} />
        )}

        <QuickActions onScanReceipt={scanReceipt} onPlanWeek={planWeek} onQuickAdd={quickAdd} />

        <UseSoonSection
          items={expiringPreview}
          locations={locationsQuery.data ?? []}
          countLabel={expiringCountLabel}
          accessibilityLabel={useSoonAccessibilityLabel}
          onSeeAll={openUseSoon}
        />

        {plan && week && weekProgressText && weekRemainingText ? (
          <WeekSection
            plan={plan}
            today={today}
            progressLabel={weekProgressText}
            remainingLabel={weekRemainingText}
            onOpenPlan={openPlan}
          />
        ) : null}

        <KitchenGlanceSection
          items={snapshotItems}
          locations={locationsQuery.data ?? []}
          now={now}
          onSeeAll={openKitchen}
          onPlacePress={openPlace}
        />

        <CreditBalance balance={creditsQuery.data ?? EMPTY_CREDIT_BALANCE} onTopUp={topUp} />
      </View>
    </Screen>
  );
}
