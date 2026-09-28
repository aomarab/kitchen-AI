import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import type { MealSlot } from '@kitchen/contracts';
import { formatHijriDate, type MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Bento,
  Button,
  Card,
  Chip,
  QuantityStepper,
  LoadingState,
  ErrorState,
  EmptyState,
  RecipeThumb,
  Tile,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { usePlan, useUpdatePlanEntry, useRegeneratePlanEntry } from '../../hooks/plans';
import { formatMinutes, formatDateL, formatQty } from '../../lib/format';
import { planEntryStatus } from '../../lib/plan-entry-status';
import { radius, spacing } from '../../theme';

const SLOT_KEY: Record<MealSlot, MessageKey> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};

const MINI_TILE_HEIGHT = 112;

export default function EntryDetail() {
  const { t, locale, prefs, showHijri } = useFormat();
  const router = useRouter();
  const { id, planId } = useLocalSearchParams<{ id: string; planId?: string }>();
  const plan = usePlan(planId ?? null);
  const update = useUpdatePlanEntry(planId ?? '');
  const regenerate = useRegeneratePlanEntry(planId ?? '');

  const entry = plan.data?.entries.find((e) => e.id === id);

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
        <EmptyState icon="plans" title={t('errors.NOT_FOUND')} />
      </Screen>
    );
  }

  const recipe = entry.recipe;
  const slot = t(SLOT_KEY[entry.slot]);
  const status = planEntryStatus(entry);
  const statusLabel = t(status.labelKey);
  const dateLabel = formatDateL(locale, entry.date, {
    month: 'short',
    day: 'numeric',
  });
  const hijriLabel = showHijri ? formatHijriDate(`${entry.date}T00:00:00`) : null;
  const servings = formatQty(locale, entry.servings, prefs);
  const minutes = recipe.prepMinutes + recipe.cookMinutes;
  const minutesLabel = t('recipe.cookTime', {
    minutes: formatMinutes(locale, minutes, prefs),
  });
  const servingsAccessibility = `${t('mobile.plans.servings')} ${servings}`;
  const decrementServings = () =>
    update.mutate({ entryId: entry.id, body: { servings: Math.max(1, entry.servings - 1) } });
  const incrementServings = () =>
    update.mutate({ entryId: entry.id, body: { servings: entry.servings + 1 } });

  return (
    <Screen scroll>
      <Header title={t('mobile.plans.entryTitle')} onBack={() => router.back()} />

      <Card style={{ gap: spacing.lg, borderRadius: radius.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <RecipeThumb
            heroImageUrl={recipe.heroImageUrl}
            dishKey={`${recipe.locale}:${recipe.title}`}
            title={recipe.title}
            accessibilityLabel={t('mobile.recipe.imageLabel', { title: recipe.title })}
            style={{ width: 64, height: 64, borderRadius: radius.md }}
          />
          <View style={{ flex: 1 }}>
            <AppText variant="display">{recipe.title}</AppText>
            <AppText variant="caption" muted>
              {minutesLabel}
            </AppText>
          </View>
        </View>

        <Bento>
          <Tile
            span={2}
            fill="surfaceAlt"
            height={MINI_TILE_HEIGHT}
            accessibilityRole="adjustable"
            accessibilityLabel={servingsAccessibility}
            actions={[
              { name: 'increment', label: t('mobile.common.increase'), onPress: incrementServings },
              { name: 'decrement', label: t('mobile.common.decrease'), onPress: decrementServings },
            ]}
          >
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('mobile.plans.servings')}
              </AppText>
              <QuantityStepper
                value={entry.servings}
                min={1}
                onChange={(nextServings) =>
                  update.mutate({ entryId: entry.id, body: { servings: nextServings } })
                }
                label={servings}
                accessibilityLabel={servingsAccessibility}
                accessible={false}
                decrementLabel={t('mobile.common.decrease')}
                incrementLabel={t('mobile.common.increase')}
              />
            </View>
          </Tile>
          <Tile
            fill="surfaceAlt"
            height={MINI_TILE_HEIGHT}
            weight={1.4}
            accessibilityLabel={`${slot}, ${dateLabel}${hijriLabel ? `, ${hijriLabel}` : ''}`}
          >
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {slot}
              </AppText>
              <Chip label={dateLabel} variant="tag" />
              {hijriLabel ? (
                <AppText variant="caption" muted>
                  {hijriLabel}
                </AppText>
              ) : null}
            </View>
          </Tile>
          <Tile
            fill="surfaceAlt"
            height={MINI_TILE_HEIGHT}
            accessibilityLabel={`${t('mobile.plans.status')} ${statusLabel}`}
          >
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('mobile.plans.status')}
              </AppText>
              <Badge tone={status.tone} label={statusLabel} />
            </View>
          </Tile>
        </Bento>
      </Card>

      <Button
        title={t('mobile.home.viewRecipe')}
        onPress={() => router.push(`/recipe/${recipe.id}`)}
      />
      <Button
        title={t('mobile.recipe.startCooking')}
        variant="secondary"
        icon="flame"
        onPress={() => router.push(`/recipe/${recipe.id}/cook`)}
      />
      <Button
        title={t('mobile.plans.changeMeal')}
        variant="secondary"
        icon="swap"
        loading={regenerate.isPending}
        onPress={() =>
          regenerate.mutate({ entryId: entry.id, body: { excludeRecipeIds: [recipe.id] } })
        }
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          title={t('plans.cooked')}
          variant="secondary"
          icon="check"
          onPress={() => update.mutate({ entryId: entry.id, body: { state: 'cooked' } })}
          style={{ flex: 1 }}
        />
        <Button
          title={t('plans.skipped')}
          variant="secondary"
          onPress={() => update.mutate({ entryId: entry.id, body: { state: 'skipped' } })}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}
