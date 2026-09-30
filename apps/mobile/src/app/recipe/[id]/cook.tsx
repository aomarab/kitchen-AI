import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { projectTimer } from '@kitchen/contracts';
import {
  AppText,
  Button,
  ErrorState,
  Header,
  IconButton,
  LoadingState,
  Progress,
  Screen,
} from '../../../components';
import { LiveAssistantScreen } from '../../../features/assistant/LiveAssistantScreen';
import { CookIngredientChip } from '../../../features/recipe/CookIngredientChip';
import { CookTimerPanel } from '../../../features/recipe/CookTimerPanel';
import { useFormat } from '../../../hooks/useFormat';
import { useRecipe } from '../../../hooks/recipe';
import { useCreateTimer, useTimers, useUpdateTimer } from '../../../hooks/timers';
import { existingStepTimer, stepTimerPlan } from '../../../lib/cook-timers';
import { hasRunningTimer, useTimerTick } from '../../../lib/timers';
import { formatMinutes } from '../../../lib/format';
import { parseServingsParam, stepIngredients } from '../../../lib/recipe';
import { spacing, ThemeModeOverride } from '../../../theme';
import { useTheme } from '../../../theme/useTheme';

const COOK_NAV_TARGET_HEIGHT = 44;

export default function CookMode() {
  return (
    <ThemeModeOverride mode="dark">
      <StatusBar style="light" />
      <CookModeContent />
    </ThemeModeOverride>
  );
}

function CookModeContent() {
  useKeepAwake();
  // Ticks only while a timer is worth watching, so a recipe with no timer
  // running does not re-render this screen once a second for no reason.
  const timers = useTimers();
  const createTimer = useCreateTimer();
  const updateTimer = useUpdateTimer();
  /*
   * Every hook here runs before the loading early-return below, which is why
   * the tick is gated on a value read straight from the query rather than on
   * the current step's timer: the step is not known until the recipe has
   * loaded, and a hook cannot be called conditionally.
   */
  const anyRunning = hasRunningTimer(timers.data?.items ?? [], new Date());
  const now = useTimerTick(anyRunning);
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; servings?: string | string[] }>();
  const { colors } = useTheme();
  const recipe = useRecipe(params.id ?? null, locale);
  const [step, setStep] = useState(0);
  // A hands-free voice assistant, opened over the step so a cook with messy
  // hands can ask a question without leaving the recipe. Locked to voice: there
  // is no camera or typing to reach for mid-cook.
  const [assistantOpen, setAssistantOpen] = useState(false);

  if (recipe.isLoading) {
    return (
      <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
        <LoadingState />
      </Screen>
    );
  }

  if (recipe.isError || !recipe.data) {
    return (
      <Screen>
        <Header title={t('mobile.common.error')} onBack={() => router.back()} />
        <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />
      </Screen>
    );
  }

  const steps = recipe.data.steps;
  const current = steps[step]!;
  const total = steps.length;
  const isLast = step === total - 1;
  const servings = parseServingsParam(params.servings) ?? recipe.data.servings;
  const matchedIngredients = stepIngredients(current.text, recipe.data.ingredients, locale);
  const nextStep = steps[step + 1] ?? null;

  const plan = stepTimerPlan({
    recipeTitle: recipe.data.title,
    stepNumber: step + 1,
    stepWord: t('mobile.recipe.stepWord'),
    durationMinutes: current.durationMinutes,
  });
  const existing = plan.ok ? existingStepTimer(timers.data?.items ?? [], plan.body.label) : null;
  // Projected, not the status the server last wrote: a timer that ran out
  // while this screen was open is finished, whatever the cached row says.
  const projected = existing ? projectTimer(existing, now) : null;
  const progressLabel = t('mobile.recipe.stepProgress', {
    current: formatMinutes(locale, step + 1, prefs),
    total: formatMinutes(locale, total, prefs),
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.xl }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              style={{ width: 74, minHeight: COOK_NAV_TARGET_HEIGHT, justifyContent: 'center' }}
            >
              <Button
                title={t('mobile.recipe.exitCookMode')}
                variant="ghost"
                size="S"
                fullWidth={false}
                onPress={() => router.back()}
              />
            </View>
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <AppText variant="caption" muted center numberOfLines={1}>
                {progressLabel}
              </AppText>
            </View>
            <View
              style={{
                width: 74,
                minHeight: COOK_NAV_TARGET_HEIGHT,
                alignItems: 'flex-end',
                justifyContent: 'center',
              }}
            >
              <IconButton
                icon="chat"
                tone="surface"
                accessibilityLabel={t('mobile.assistant.cookAsk')}
                onPress={() => setAssistantOpen(true)}
              />
            </View>
          </View>

          <Progress
            value={(step + 1) / total}
            accessibilityLabel={progressLabel}
            accessibilityValue={{ min: 0, max: total, now: step + 1, text: progressLabel }}
            style={{ direction: 'ltr' }}
          />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.gutter,
            gap: spacing.xl,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: spacing.md }}>
            <AppText variant="eyebrow" color="primaryText">
              {t('mobile.recipe.stepWord')} {formatMinutes(locale, step + 1, prefs)}
            </AppText>
            <AppText variant="hero">{current.text}</AppText>
          </View>

          {matchedIngredients.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {matchedIngredients.map((ingredient) => (
                <CookIngredientChip
                  key={ingredient.ingredient.id}
                  ingredient={ingredient}
                  servings={servings}
                  baseServings={recipe.data.servings}
                />
              ))}
            </View>
          ) : null}

          <CookTimerPanel
            plan={plan}
            projected={projected}
            pending={createTimer.isPending || updateTimer.isPending}
            durationMinutes={current.durationMinutes ?? 0}
            onStart={() => {
              if (plan.ok) createTimer.mutate(plan.body);
            }}
            onAction={(timerId, body) => updateTimer.mutate({ id: timerId, body })}
          />

          {nextStep ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('mobile.recipe.upNext')}
              </AppText>
              <AppText muted>{nextStep.text}</AppText>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={{
            padding: spacing.gutter,
            paddingTop: spacing.sm,
            gap: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.bg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Button
              title={t('mobile.recipe.prev')}
              variant="secondary"
              disabled={step === 0}
              style={{ flex: 0.35, minHeight: COOK_NAV_TARGET_HEIGHT }}
              onPress={() => setStep((s) => Math.max(0, s - 1))}
            />
            <Button
              title={isLast ? t('mobile.recipe.finish') : t('mobile.recipe.next')}
              variant="primary"
              style={{ flex: 1, minHeight: COOK_NAV_TARGET_HEIGHT }}
              onPress={() => {
                if (isLast) router.back();
                else setStep((s) => Math.min(total - 1, s + 1));
              }}
            />
          </View>
          <AppText variant="caption" muted center>
            {t('mobile.recipe.cookModeHint')}
          </AppText>
        </View>
      </View>

      {assistantOpen ? (
        <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}>
          <Screen padded={false} edges={[]} style={{ backgroundColor: 'transparent' }}>
            <LiveAssistantScreen
              initialMode="voice"
              lockMode
              onExit={() => setAssistantOpen(false)}
            />
          </Screen>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
