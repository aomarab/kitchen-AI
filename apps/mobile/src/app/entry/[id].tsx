import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import type { MealSlot } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Button,
  Card,
  QuantityStepper,
  LoadingState,
  ErrorState,
  EmptyState,
  RecipeThumb,
} from '../../components';
import type { BadgeTone } from '../../components/Badge';
import { useFormat } from '../../hooks/useFormat';
import { usePlan, useUpdatePlanEntry, useRegeneratePlanEntry } from '../../hooks/plans';
import { formatMinutes, formatDateWithHijri } from '../../lib/format';
import { radius, spacing } from '../../theme';

const SLOT_KEY: Record<MealSlot, MessageKey> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};

const STATE_TONE: Record<string, BadgeTone> = {
  planned: 'info',
  cooked: 'success',
  skipped: 'neutral',
};

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

  return (
    <Screen scroll>
      <Header title={t('mobile.plans.entryTitle')} onBack={() => router.back()} />

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">{recipe.title}</AppText>
        <RecipeThumb
          heroImageUrl={recipe.heroImageUrl}
          dishKey={`${recipe.locale}:${recipe.title}`}
          title={recipe.title}
          accessibilityLabel={t('mobile.recipe.imageLabel', { title: recipe.title })}
          style={{ width: '100%', height: 160, borderRadius: radius.md }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Badge label={t(SLOT_KEY[entry.slot])} />
          <Badge tone={STATE_TONE[entry.state] ?? 'neutral'} label={t(`plans.${entry.state}` as MessageKey)} />
          {entry.fullyCovered ? <Badge tone="success" label={t('plans.fullyCovered')} /> : null}
        </View>
        <AppText variant="caption" muted>
          {formatDateWithHijri(locale, entry.date, showHijri)}
          {'  ·  '}
          {t('recipe.cookTime', { minutes: formatMinutes(locale, recipe.cookMinutes, prefs) })}
        </AppText>
      </Card>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('recipe.servings', { count: entry.servings })}
        </AppText>
        <QuantityStepper
          value={entry.servings}
          min={1}
          onChange={(servings) => update.mutate({ entryId: entry.id, body: { servings } })}
          decrementLabel={t('mobile.common.decrease')}
          incrementLabel={t('mobile.common.increase')}
        />
      </View>

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
          variant="ghost"
          onPress={() => update.mutate({ entryId: entry.id, body: { state: 'skipped' } })}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}
