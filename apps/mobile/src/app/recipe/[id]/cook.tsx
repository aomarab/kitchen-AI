import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatRemaining, projectTimer, type CookingTimer } from '@kitchen/contracts';
import {
  AppText,
  Button,
  Chip,
  LoadingState,
  OrbMascot,
  RoundButton,
  Screen,
} from '../../../components';
import { LiveAssistantScreen } from '../../../features/assistant/LiveAssistantScreen';
import { useFormat } from '../../../hooks/useFormat';
import { useRecipe } from '../../../hooks/recipe';
import { useCreateTimer, useTimers } from '../../../hooks/timers';
import { existingStepTimer, stepTimerPlan, type StepTimerPlan } from '../../../lib/cook-timers';
import { hasRunningTimer, useTimerTick } from '../../../lib/timers';
import { formatMeasure, formatMinutes, ingredientName } from '../../../lib/format';
import { parseServingsParam, scaleQuantityForServings, stepIngredients } from '../../../lib/recipe';
import { radius, spacing } from '../../../theme';
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
  const params = useLocalSearchParams<{ id: string; servings?: string | string[] }>();
  const { colors } = useTheme();
  const recipe = useRecipe(params.id ?? null, locale);
  const [step, setStep] = useState(0);
  // A hands-free voice assistant, opened over the step so a cook with messy
  // hands can ask a question without leaving the recipe. Locked to voice: there
  // is no camera or typing to reach for mid-cook.
  const [assistantOpen, setAssistantOpen] = useState(false);

  if (recipe.isLoading || !recipe.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <LoadingState />
      </SafeAreaView>
    );
  }

  const steps = recipe.data.steps;
  const current = steps[step]!;
  const isLast = step === steps.length - 1;
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
    total: formatMinutes(locale, steps.length, prefs),
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 48, alignItems: 'flex-start' }}>
              <RoundButton
                icon="close"
                tone="surface"
                size={40}
                accessibilityLabel={t('mobile.recipe.exitCookMode')}
                onPress={() => router.back()}
              />
            </View>
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={1} center>
                {recipe.data.title}
              </AppText>
              <AppText variant="caption" muted center numberOfLines={1}>
                {progressLabel}
              </AppText>
            </View>
            <View style={{ width: 48, alignItems: 'flex-end' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('mobile.assistant.cookAsk')}
                onPress={() => setAssistantOpen(true)}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <OrbMascot size={44} state={assistantOpen ? 'listening' : 'idle'} />
              </Pressable>
            </View>
          </View>

          <ProgressBar step={step} total={steps.length} progressLabel={progressLabel} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="hero">{current.text}</AppText>

          {matchedIngredients.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {matchedIngredients.map((item) => {
                const quantity = scaleQuantityForServings(
                  item.quantity,
                  recipe.data.servings,
                  servings,
                );
                const name = ingredientName(locale, item.ingredient);
                const measure = formatMeasure(t, locale, quantity, item.unit, prefs);
                return <Chip key={item.ingredient.id} label={`${name} · ${measure}`} />;
              })}
            </View>
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

          {nextStep ? (
            <View
              style={{
                padding: spacing.lg,
                gap: spacing.xs,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bg,
              }}
            >
              <AppText variant="caption" muted>
                {t('mobile.recipe.upNext')}
              </AppText>
              <AppText numberOfLines={2}>{nextStep.text}</AppText>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={{
            padding: spacing.lg,
            paddingTop: spacing.sm,
            gap: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.bg,
          }}
        >
          <AppText variant="caption" muted center>
            {t('mobile.recipe.cookModeHint')}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <RoundButton
              icon="back"
              directional
              tone="surface"
              size={48}
              disabled={step === 0}
              accessibilityLabel={t('mobile.recipe.prev')}
              onPress={() => setStep((s) => Math.max(0, s - 1))}
            />
            <Button
              title={isLast ? t('mobile.recipe.finish') : t('mobile.recipe.next')}
              icon={isLast ? 'check' : undefined}
              variant="primary"
              onPress={() => {
                if (isLast) router.back();
                else setStep((s) => Math.min(steps.length - 1, s + 1));
              }}
              style={{ flex: 1 }}
            />
          </View>
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

function ProgressBar({
  step,
  total,
  progressLabel,
}: {
  step: number;
  total: number;
  progressLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: step + 1, text: progressLabel }}
      style={{ flexDirection: 'row', direction: 'ltr', gap: spacing.xs }}
    >
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: index <= step ? colors.primary : colors.border,
          }}
        />
      ))}
    </View>
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
  const { colors, tintNamed } = useTheme();

  if (!plan.ok) return null;

  const tint = tintNamed('butter');
  const countdown = projected
    ? formatRemaining(projected.remainingSec)
    : formatRemaining(Math.round(durationMinutes * 60));
  const finished = projected?.status === 'done';
  const runningAnnouncement = projected
    ? t('mobile.recipe.stepTimerRunning', {
        remaining: formatRemaining(projected.remainingSec),
      })
    : undefined;
  const statusCaption = projected
    ? finished
      ? t('mobile.recipe.stepTimerDone')
      : t('mobile.recipe.stepTimerRunningStatus')
    : null;
  const statusAccessibilityLabel = finished ? (statusCaption ?? undefined) : runningAnnouncement;
  const buttonTitle = t('mobile.recipe.startStepTimer', {
    minutes: formatMinutes(locale, durationMinutes, prefs),
  });

  return (
    <View
      style={{
        padding: spacing.lg,
        gap: spacing.md,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: tint.bg,
      }}
    >
      <AppText variant="numeral" style={{ color: tint.fg }}>
        {countdown}
      </AppText>
      {statusCaption ? (
        <AppText
          variant="caption"
          accessibilityLabel={statusAccessibilityLabel}
          style={{ color: colors.textMuted }}
        >
          {statusCaption}
        </AppText>
      ) : null}
      {projected ? null : (
        <Button
          title={buttonTitle}
          icon="clock"
          variant="primary"
          disabled={pending}
          onPress={onStart}
        />
      )}
    </View>
  );
}
