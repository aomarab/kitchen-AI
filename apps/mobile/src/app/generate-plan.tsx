import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Cuisine, CreditAction, MealSlot, PlanScope } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Button,
  Card,
  Chip,
  Field,
  OrbMascot,
  QuantityStepper,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import { useGeneratePlan } from '../hooks/plans';
import { useCredits } from '../hooks/credits';
import { useJob, isTerminal } from '../hooks/job';
import { canAfford, costOf, creditsShort } from '../lib/credits';
import { jobErrorKey } from '../lib/errors';
import { todayISODate } from '../lib/expiry';
import { formatMinutes, formatQty } from '../lib/format';
import { spacing } from '../theme';

/** Each plan scope maps to the billable action it triggers (spec §3). */
const SCOPE_ACTION: Record<PlanScope, CreditAction> = {
  daily: 'plan.daily',
  weekly: 'plan.weekly',
  monthly: 'plan.monthly',
};

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const COOK_TIMES = [30, 45, 60, 90];
const CUISINES: Cuisine[] = [
  'levantine',
  'gulf',
  'egyptian',
  'moroccan',
  'turkish',
  'persian',
  'indian',
  'italian',
  'mediterranean',
  'chinese',
  'japanese',
  'thai',
  'mexican',
  'american',
  'french',
];

const SLOT_KEY: Record<MealSlot, MessageKey> = {
  breakfast: 'plans.breakfast',
  lunch: 'plans.lunch',
  dinner: 'plans.dinner',
  snack: 'plans.snack',
};

const SCOPE_KEY: Record<PlanScope, MessageKey> = {
  daily: 'plans.daily',
  weekly: 'plans.weekly',
  monthly: 'plans.monthly',
};

function toggle<T>(set: readonly T[], value: T): T[] {
  return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
}

export default function GeneratePlan() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();

  const [scope, setScope] = useState<PlanScope>('weekly');
  const [startsOn, setStartsOn] = useState(todayISODate());
  const [servings, setServings] = useState(2);
  const [slots, setSlots] = useState<MealSlot[]>(['breakfast', 'lunch', 'dinner']);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [maxCook, setMaxCook] = useState<number | null>(null);

  const generate = useGeneratePlan();
  const credits = useCredits();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const running = !!jobId && !isTerminal(job.data);
  const failed = job.data?.status === 'failed';

  const action = SCOPE_ACTION[scope];
  const cost = costOf(action);
  // Only surface a cost for actions dearer than a daily plan (spec §8 gating).
  const showCost = cost > costOf('plan.daily');
  // Never block while the balance is still loading; a known balance that cannot
  // cover the action is what gates generation.
  const affordable = credits.data ? canAfford(credits.data, action) : true;
  const shortfall = credits.data ? creditsShort(credits.data, action) : 0;

  useEffect(() => {
    if (job.data?.status === 'done' && job.data.resultRef) {
      router.replace(`/plan/${job.data.resultRef.id}`);
    }
  }, [job.data, router]);

  const goBuyCredits = () => router.push(`/buy-credits?action=${action}`);

  const submit = async () => {
    // Tell the user before spending: route to top up rather than firing a
    // request the server would reject with 402.
    if (!affordable) {
      goBuyCredits();
      return;
    }
    const started = await generate.mutateAsync({
      scope,
      startsOn,
      servings,
      slots: slots.length > 0 ? slots : undefined,
      cuisinePrefs: cuisines.length > 0 ? cuisines : undefined,
      maxCookMinutes: maxCook ?? undefined,
      locale,
    });
    setJobId(started.id);
  };

  return (
    <Screen scroll>
      <Header title={t('mobile.plans.generateTitle')} onBack={() => router.back()} />

      {running ? (
        <View style={{ flex: 1, justifyContent: 'space-between', gap: spacing.lg }}>
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}
          >
            <OrbMascot state="looking" size={96} />
            <AppText variant="heading" center>
              {t('mobile.job.buildingPlan')}
            </AppText>
          </View>
          <Button
            title={t('mobile.plans.generateCta')}
            icon="plans"
            loading
            disabled
            onPress={() => undefined}
          />
        </View>
      ) : (
        <>
          {failed ? (
            <Card tone="alt" style={{ gap: spacing.sm }}>
              <AppText color="danger">
                {t(jobErrorKey(job.data?.error, 'mobile.job.generationFailed'))}
              </AppText>
              <Button title={t('common.retry')} onPress={() => setJobId(null)} />
            </Card>
          ) : null}

          <Card style={{ gap: spacing.md }}>
            <AppText variant="heading">{t('mobile.plans.scope')}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {(['daily', 'weekly', 'monthly'] as PlanScope[]).map((value) => (
                <Chip
                  key={value}
                  label={t(SCOPE_KEY[value])}
                  selected={scope === value}
                  onPress={() => setScope(value)}
                />
              ))}
            </View>
          </Card>

          <Card style={{ gap: spacing.md }}>
            <AppText variant="heading">{t('mobile.plans.startDate')}</AppText>
            <Field
              value={startsOn}
              onChangeText={setStartsOn}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Card>

          <Card style={{ gap: spacing.md }}>
            <AppText variant="heading">{t('mobile.plans.servings')}</AppText>
            <QuantityStepper
              value={servings}
              onChange={setServings}
              min={1}
              accessibilityLabel={t('mobile.plans.servings')}
              decrementLabel={t('mobile.common.decrease')}
              incrementLabel={t('mobile.common.increase')}
            />
          </Card>

          <Card style={{ gap: spacing.md }}>
            <AppText variant="heading">{t('mobile.plans.slots')}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {SLOTS.map((slot) => (
                <Chip
                  key={slot}
                  label={t(SLOT_KEY[slot])}
                  selected={slots.includes(slot)}
                  onPress={() => setSlots((prev) => toggle(prev, slot))}
                />
              ))}
            </View>
          </Card>

          <Card style={{ gap: spacing.md }}>
            <AppText variant="heading">{t('mobile.plans.maxCookTime')}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Chip
                label={t('mobile.plans.anyCuisine')}
                selected={maxCook === null}
                onPress={() => setMaxCook(null)}
              />
              {COOK_TIMES.map((minutes) => (
                <Chip
                  key={minutes}
                  label={t('mobile.plans.minutesValue', {
                    minutes: formatMinutes(locale, minutes, prefs),
                  })}
                  selected={maxCook === minutes}
                  onPress={() => setMaxCook(minutes)}
                />
              ))}
            </View>
          </Card>

          <Card style={{ gap: spacing.md }}>
            <AppText variant="heading">{t('mobile.plans.cuisines')}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {CUISINES.map((cuisine) => (
                <Chip
                  key={cuisine}
                  label={t(`mobile.cuisines.${cuisine}` as MessageKey)}
                  selected={cuisines.includes(cuisine)}
                  onPress={() => setCuisines((prev) => toggle(prev, cuisine))}
                />
              ))}
            </View>
          </Card>

          {showCost && affordable ? (
            <AppText variant="caption" muted>
              {t('mobile.credits.costNotice', { cost: formatQty(locale, cost, prefs) })}
            </AppText>
          ) : null}

          {!affordable ? (
            <Card tone="alt" style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong" accessibilityRole="alert">
                {t('mobile.credits.needMore', { needed: formatQty(locale, shortfall, prefs) })}
              </AppText>
              <Button title={t('mobile.credits.getMore')} icon="wallet" onPress={goBuyCredits} />
            </Card>
          ) : (
            <Button
              title={t('mobile.plans.generateCta')}
              icon="plans"
              loading={generate.isPending}
              onPress={() => void submit()}
            />
          )}
        </>
      )}
    </Screen>
  );
}
