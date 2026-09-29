import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { MealPlanEntry, MealPlanEntryState, MealSlot } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  AppText,
  Badge,
  Button,
  DirectionalIcon,
  EmptyState,
  ErrorState,
  Header,
  ListRow,
  LoadingState,
  QuantityStepper,
  RecipeThumb,
  Screen,
  SegmentedControl,
} from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { usePlan, useRegeneratePlanEntry, useUpdatePlanEntry } from '../../hooks/plans';
import { formatDateL, formatMinutes, formatQty, hijriCaption } from '../../lib/format';
import { planEntryStatus } from '../../lib/plan-entry-status';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const SLOT_KEY: Record<MealSlot, MessageKey> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};

const ENTRY_ACTION_ROW_MIN_HEIGHT = 56;

function minutesMessage({
  t,
  locale,
  prefs,
  minutes,
}: {
  t: ReturnType<typeof useFormat>['t'];
  locale: ReturnType<typeof useFormat>['locale'];
  prefs: ReturnType<typeof useFormat>['prefs'];
  minutes: number;
}) {
  return t('mobile.plans.minutesValue', { minutes }).replace(
    String(minutes),
    formatMinutes(locale, minutes, prefs),
  );
}

function RecipeRow({
  entry,
  slot,
  dateLabel,
  servingsLabel,
  haveLabel,
  onPress,
}: {
  entry: MealPlanEntry;
  slot: string;
  dateLabel: string;
  servingsLabel: string;
  haveLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const recipe = entry.recipe;
  const accessibilityLabel = `${recipe.title}, ${slot}, ${dateLabel}, ${servingsLabel}, ${haveLabel}`;

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
          heroImageUrl={recipe.heroImageUrl}
          dishKey={recipe.id}
          title={recipe.title}
          size={72}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {recipe.title}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {slot} · {dateLabel} · {servingsLabel}
          </AppText>
          <Badge tone={entry.fullyCovered ? 'success' : 'warn'} label={haveLabel} />
        </View>
        <DirectionalIcon name="chevR" size={18} color={colors.control} />
      </Animated.View>
    </Pressable>
  );
}

export default function EntryDetail() {
  const { t, locale, prefs, showHijri } = useFormat();
  const router = useRouter();
  const { id, planId } = useLocalSearchParams<{ id: string; planId?: string }>();
  const plan = usePlan(planId ?? null);
  const update = useUpdatePlanEntry(planId ?? '');
  const regenerate = useRegeneratePlanEntry(planId ?? '');

  const entry = plan.data?.entries.find((candidate) => candidate.id === id);

  if (plan.isLoading) {
    return (
      <Screen>
        <Header title={t('mobile.plans.entryTitle')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (plan.isError) {
    return (
      <Screen>
        <Header title={t('mobile.plans.entryTitle')} onBack={() => router.back()} />
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      </Screen>
    );
  }
  if (!entry) {
    return (
      <Screen>
        <Header title={t('mobile.plans.entryTitle')} onBack={() => router.back()} />
        <EmptyState illustration="calendar" title={t('errors.NOT_FOUND')} />
      </Screen>
    );
  }

  const recipe = entry.recipe;
  const slot = t(SLOT_KEY[entry.slot]);
  const status = planEntryStatus(entry);
  const statusLabel = t(status.labelKey);
  const dateLabel = formatDateL(locale, entry.date, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const hijriLabel = hijriCaption(locale, `${entry.date}T00:00:00`, showHijri);
  const servings = formatQty(locale, entry.servings, prefs);
  const servingsLabel = t('recipe.servings', { count: entry.servings }).replace(
    String(entry.servings),
    servings,
  );
  const minutes = recipe.prepMinutes + recipe.cookMinutes;
  const minutesLabel = minutesMessage({ t, locale, prefs, minutes });
  const haveLabel = entry.fullyCovered ? t('mobile.home.allInKitchen') : statusLabel;
  const setEntryState = (state: MealPlanEntryState) =>
    update.mutate({ entryId: entry.id, body: { state } });

  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            title={t('mobile.recipe.startCooking')}
            variant="secondary"
            onPress={() => router.push(`/recipe/${recipe.id}/cook`)}
          />
          <Button title={t('mobile.plans.keepMeal')} onPress={() => router.back()} />
        </View>
      }
    >
      <Header title={t('mobile.plans.entryTitle')} onBack={() => router.back()} />

      <View style={{ gap: spacing.xl }}>
        <RecipeRow
          entry={entry}
          slot={slot}
          dateLabel={hijriLabel ? `${dateLabel} · ${hijriLabel}` : dateLabel}
          servingsLabel={servingsLabel}
          haveLabel={haveLabel}
          onPress={() => router.push(`/recipe/${recipe.id}`)}
        />

        <View style={{ gap: spacing.sm }}>
          <AppText variant="label">{t('mobile.plans.status')}</AppText>
          <SegmentedControl<MealPlanEntryState>
            value={entry.state}
            onChange={setEntryState}
            options={[
              { value: 'planned', label: t('plans.planned') },
              { value: 'cooked', label: t('plans.cooked') },
              { value: 'skipped', label: t('plans.skipped') },
            ]}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{t('mobile.plans.servings')}</AppText>
            <AppText variant="caption" muted>
              {minutesLabel}
            </AppText>
          </View>
          <QuantityStepper
            value={entry.servings}
            min={1}
            onChange={(nextServings) =>
              update.mutate({ entryId: entry.id, body: { servings: nextServings } })
            }
            label={servings}
            accessibilityLabel={`${t('mobile.plans.servings')} ${servings}`}
            accessible={false}
            decrementLabel={t('mobile.common.decrease')}
            incrementLabel={t('mobile.common.increase')}
          />
        </View>

        <View>
          <ListRow
            title={t('mobile.plans.changeMeal')}
            subtitle={regenerate.isPending ? t('mobile.plans.regenerating') : undefined}
            icon="shuffle"
            showChevron
            style={{ minHeight: ENTRY_ACTION_ROW_MIN_HEIGHT }}
            accessibilityState={{ busy: regenerate.isPending }}
            onPress={() =>
              regenerate.mutate({ entryId: entry.id, body: { excludeRecipeIds: [recipe.id] } })
            }
          />
        </View>
      </View>
    </Screen>
  );
}
