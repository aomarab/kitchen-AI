import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Cuisine, MealSlot, PlanScope } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Button,
  Card,
  Chip,
  Field,
  QuantityStepper,
  SegmentedControl,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import { useGeneratePlan } from '../hooks/plans';
import { useJob, isTerminal } from '../hooks/job';
import { todayISODate } from '../lib/expiry';
import { formatMinutes } from '../lib/format';
import { colors, radius, spacing } from '../theme';

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
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const running = !!jobId && !isTerminal(job.data);
  const failed = job.data?.status === 'failed';

  useEffect(() => {
    if (job.data?.status === 'done' && job.data.resultRef) {
      router.replace(`/plan/${job.data.resultRef.id}`);
    }
  }, [job.data, router]);

  const submit = async () => {
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
        <Card tone="primary" style={{ gap: spacing.sm }}>
          <AppText variant="bodyStrong">{t('mobile.job.buildingPlan')}</AppText>
          <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surface }}>
            <View
              style={{
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: colors.primary,
                // No alignSelf: the root layout calls I18nManager.forceRTL, so the
                // flex start edge is already the right edge in Arabic. Setting
                // flex-end here flipped it a second time and filled from the left.
                width: `${Math.round((job.data?.progress ?? 0.1) * 100)}%`,
              }}
            />
          </View>
        </Card>
      ) : null}

      {failed ? (
        <Card tone="alt" style={{ gap: spacing.sm }}>
          <AppText color="danger">{t('mobile.job.generationFailed')}</AppText>
          <Button title={t('common.retry')} onPress={() => setJobId(null)} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.plans.scope')}
        </AppText>
        <SegmentedControl<PlanScope>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'daily', label: t('plans.daily') },
            { value: 'weekly', label: t('plans.weekly') },
            { value: 'monthly', label: t('plans.monthly') },
          ]}
        />
      </View>

      <Field
        label={t('mobile.plans.startDate')}
        value={startsOn}
        onChangeText={setStartsOn}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.plans.servings')}
        </AppText>
        <QuantityStepper
          value={servings}
          onChange={setServings}
          min={1}
          decrementLabel={t('mobile.common.decrease')}
          incrementLabel={t('mobile.common.increase')}
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.plans.slots')}
        </AppText>
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
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.plans.maxCookTime')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Chip
            label={t('mobile.plans.anyCuisine')}
            selected={maxCook === null}
            onPress={() => setMaxCook(null)}
          />
          {COOK_TIMES.map((minutes) => (
            <Chip
              key={minutes}
              label={t('mobile.plans.minutesValue', { minutes: formatMinutes(locale, minutes, prefs) })}
              selected={maxCook === minutes}
              onPress={() => setMaxCook(minutes)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('mobile.plans.cuisines')}
        </AppText>
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
      </View>

      <Button
        title={t('mobile.plans.generateCta')}
        icon="plans"
        loading={generate.isPending || running}
        disabled={running}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
