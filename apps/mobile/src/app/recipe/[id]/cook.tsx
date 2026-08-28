import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatRemaining, projectTimer, type CookingTimer } from '@kitchen/contracts';
import { AppText, Button, Badge, LoadingState } from '../../../components';
import { LiveAssistantScreen } from '../../../features/assistant/LiveAssistantScreen';
import { useFormat } from '../../../hooks/useFormat';
import { useRecipe } from '../../../hooks/recipe';
import { useCreateTimer, useTimers } from '../../../hooks/timers';
import { existingStepTimer, stepTimerPlan, type StepTimerPlan } from '../../../lib/cook-timers';
import { hasRunningTimer, useTimerTick } from '../../../lib/timers';
import { formatMinutes } from '../../../lib/format';
import { spacing } from '../../../theme';
import { useTheme } from '../../../theme/useTheme';

/**
 * Full-screen cook mode: one step at a time, large type, forward/back stepping.
 * `useKeepAwake` holds a wake lock for as long as this screen is mounted so the
 * display never sleeps mid-recipe (spec §6.3).
 */
export default function CookMode() {
  useKeepAwake();
  // Ticks only while a timer is worth watching, so a recipe with no timer
  // running does not re-render this screen once a second for no reason.
  const timers = useTimers();
  const createTimer = useCreateTimer();
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const recipe = useRecipe(id ?? null, locale);
  const [step, setStep] = useState(0);
  // A hands-free voice assistant, opened over the step so a cook with messy
  // hands can ask a question without leaving the recipe. Locked to voice: there
  // is no camera or typing to reach for mid-cook.
  const [assistantOpen, setAssistantOpen] = useState(false);

  if (recipe.isLoading || !recipe.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
        <LoadingState />
      </SafeAreaView>
    );
  }

  const steps = recipe.data.steps;
  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  const plan = stepTimerPlan({
    recipeTitle: recipe.data.title,
    stepNumber: step + 1,
    stepWord: t('mobile.recipe.stepWord'),
    durationMinutes: current.durationMinutes,
  });
  const existing = plan.ok
    ? existingStepTimer(timers.data?.items ?? [], plan.body.label)
    : null;
  // Projected, not the status the server last wrote: a timer that ran out
  // while this screen was open is finished, whatever the cached row says.
  const projected = existing ? projectTimer(existing, now) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText variant="label" style={{ color: colors.textInverseMuted }}>
            {t('mobile.recipe.stepProgress', {
              current: formatMinutes(locale, step + 1, prefs),
              total: formatMinutes(locale, steps.length, prefs),
            })}
          </AppText>
          <Button
            title={t('mobile.recipe.exitCookMode')}
            variant="ghostInverse"
            fullWidth={false}
            onPress={() => router.back()}
          />
        </View>

        <View style={{ alignItems: 'flex-start' }}>
          <Button
            title={t('mobile.assistant.cookAsk')}
            icon="sparkles"
            variant="secondaryInverse"
            fullWidth={false}
            onPress={() => setAssistantOpen(true)}
          />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
          {current.durationMinutes ? (
            <Badge
              tone="inverse"
              label={t('recipe.cookTime', {
                minutes: formatMinutes(locale, current.durationMinutes, prefs),
              })}
            />
          ) : null}

          <StepTimerControl
            plan={plan}
            projected={projected}
            pending={createTimer.isPending}
            durationMinutes={current.durationMinutes ?? 0}
            onStart={() => {
              if (plan.ok) createTimer.mutate(plan.body);
            }}
          />
          <AppText variant="display" style={{ color: colors.textInverse }}>
            {current.text}
          </AppText>
        </View>

        <AppText variant="caption" style={{ color: colors.textInverseMuted }} center>
          {t('mobile.recipe.cookModeHint')}
        </AppText>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            title={t('mobile.recipe.prev')}
            variant="secondaryInverse"
            disabled={step === 0}
            onPress={() => setStep((s) => Math.max(0, s - 1))}
            style={{ flex: 1 }}
          />
          {isLast ? (
            <Button
              title={t('mobile.recipe.finish')}
              icon="check"
              variant="primaryInverse"
              onPress={() => router.back()}
              style={{ flex: 1 }}
            />
          ) : (
            <Button
              title={t('mobile.recipe.next')}
              variant="primaryInverse"
              onPress={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>

      {assistantOpen ? (
        <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}>
          <LiveAssistantScreen
            initialMode="voice"
            lockMode
            onExit={() => setAssistantOpen(false)}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * The one control cook mode adds: start this step's timer, or watch it.
 *
 * Renders nothing for an untimed step, and nothing for a step longer than
 * `MAX_TIMER_DURATION_SEC` — a button that the contract would refuse is worse
 * than no button, and a twelve-hour prove is not something anyone stands in
 * front of the phone waiting for.
 */
function StepTimerControl({
  plan,
  projected,
  pending,
  durationMinutes,
  onStart,
}: {
  plan: StepTimerPlan;
  projected: CookingTimer | null;
  pending: boolean;
  durationMinutes: number;
  onStart: () => void;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();

  if (!plan.ok) return null;

  if (projected) {
    const finished = projected.status === 'done';
    return (
      <AppText
        variant="label"
        style={{ color: finished ? colors.textInverse : colors.textInverseMuted }}
      >
        {finished
          ? t('mobile.recipe.stepTimerDone')
          : t('mobile.recipe.stepTimerRunning', {
              remaining: formatRemaining(projected.remainingSec),
            })}
      </AppText>
    );
  }

  return (
    <Button
      title={t('mobile.recipe.startStepTimer', {
        minutes: formatMinutes(locale, durationMinutes, prefs),
      })}
      icon="clock"
      variant="secondaryInverse"
      fullWidth={false}
      disabled={pending}
      onPress={onStart}
    />
  );
}
