import { type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View, type ViewStyle } from 'react-native';
import type { MealPlanEntry, MealSlot } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  QuantityStepper,
  LoadingState,
  ErrorState,
  EmptyState,
  RecipeThumb,
} from '../../components';
import type { BadgeTone } from '../../components/Badge';
import { useFormat } from '../../hooks/useFormat';
import { usePlan, useUpdatePlanEntry, useRegeneratePlanEntry } from '../../hooks/plans';
import { formatMinutes, formatDateWithHijri, formatQty } from '../../lib/format';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const SLOT_KEY: Record<MealSlot, MessageKey> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};

function entryStatus(entry: MealPlanEntry, t: ReturnType<typeof useFormat>['t']) {
  if (entry.state === 'cooked') return { tone: 'success' as BadgeTone, label: t('plans.cooked') };
  if (entry.fullyCovered) return { tone: 'info' as BadgeTone, label: t('plans.fullyCovered') };
  return { tone: 'warn' as BadgeTone, label: t('plans.regenerate') };
}

function MiniTile({
  accessibilityLabel,
  accessible = true,
  onPress,
  children,
}: {
  accessibilityLabel: string;
  accessible?: boolean;
  onPress?: () => void;
  children: ReactNode;
}) {
  const { colors, isDark, shadow } = useTheme();
  const base: ViewStyle = {
    flex: 1,
    minHeight: 112,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: isDark ? colors.border : colors.surfaceAlt,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    gap: spacing.sm,
    justifyContent: 'space-between',
    ...(isDark ? null : shadow.card),
  };
  if (!onPress) {
    return (
      <View accessible={accessible} accessibilityLabel={accessibilityLabel} style={base}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      {children}
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
  const status = entryStatus(entry, t);
  const dateLabel = formatDateWithHijri(locale, entry.date, showHijri, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const servings = formatQty(locale, entry.servings, prefs);
  const minutes = recipe.prepMinutes + recipe.cookMinutes;
  const minutesLabel = t('recipe.cookTime', {
    minutes: formatMinutes(locale, minutes, prefs),
  });

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

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <MiniTile accessibilityLabel={`${slot}, ${dateLabel}`}>
            <AppText variant="label" muted>
              {slot}
            </AppText>
            <Chip label={dateLabel} variant="tag" />
          </MiniTile>
          <MiniTile
            accessibilityLabel={`${t('mobile.plans.servings')} ${servings}`}
            accessible={false}
          >
            <AppText variant="label" muted>
              {t('mobile.plans.servings')}
            </AppText>
            <QuantityStepper
              value={entry.servings}
              min={1}
              onChange={(nextServings) =>
                update.mutate({ entryId: entry.id, body: { servings: nextServings } })
              }
              accessibilityLabel={`${t('mobile.plans.servings')} ${servings}`}
              decrementLabel={t('mobile.common.decrease')}
              incrementLabel={t('mobile.common.increase')}
            />
          </MiniTile>
          <MiniTile accessibilityLabel={status.label}>
            <AppText variant="label" muted>
              {status.label}
            </AppText>
            <Badge tone={status.tone} label={status.label} />
          </MiniTile>
        </View>
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
