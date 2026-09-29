import { useState, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Cuisine, CreditAction, MealSlot, PlanScope } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  AppText,
  Button,
  Chip,
  DateField,
  Header,
  Icon,
  ListRow,
  QuantityStepper,
  Screen,
  SegmentedControl,
  Sheet,
} from '../components';
import { usePressFeedback } from '../components/press-feedback';
import { OutOfCreditsPanel } from '../features/credits/OutOfCreditsPanel';
import { useCredits } from '../hooks/credits';
import { useFormat } from '../hooks/useFormat';
import { useGeneratePlan } from '../hooks/plans';
import { canAfford, costOf, creditsShort, totalCredits } from '../lib/credits';
import { todayISODate } from '../lib/expiry';
import { formatMinutes, formatQty } from '../lib/format';
import { usePlanGenerationStore } from '../stores/plan-generation';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

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

const SCOPE_OPTIONS: readonly { value: PlanScope; labelKey: MessageKey }[] = [
  { value: 'daily', labelKey: 'mobile.plans.day' },
  { value: 'weekly', labelKey: 'mobile.plans.week' },
  { value: 'monthly', labelKey: 'mobile.plans.month' },
];

function toggle<T>(set: readonly T[], value: T): T[] {
  return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="label">{title}</AppText>
      {children}
    </View>
  );
}

function SelectField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        onPress={onPress}
        {...pressFeedback.pressHandlers}
      >
        <Animated.View
          style={[
            {
              minHeight: 48,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 14,
              backgroundColor: colors.bg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
            },
            pressFeedback.animatedStyle,
          ]}
        >
          <AppText>{value}</AppText>
          <Icon name="chevD" size={18} color={colors.textMuted} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function GenerateFooter({
  cost,
  balance,
  loading,
  onSubmit,
}: {
  cost: string;
  balance: string | null;
  loading: boolean;
  onSubmit: () => void;
}) {
  const { t } = useFormat();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 62, gap: 2 }}>
        <AppText variant="bodyStrong">{cost}</AppText>
        {balance ? (
          <AppText variant="caption" muted>
            {t('mobile.plans.creditsLeftShort', { balance })}
          </AppText>
        ) : null}
      </View>
      <Button
        title={t('mobile.plans.generateCta')}
        loading={loading}
        onPress={onSubmit}
        style={{ flex: 1 }}
      />
    </View>
  );
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
  const [maxCookOpen, setMaxCookOpen] = useState(false);
  const [creditsSheetOpen, setCreditsSheetOpen] = useState(false);

  const generate = useGeneratePlan();
  const credits = useCredits();
  const startGeneration = usePlanGenerationStore((state) => state.start);

  const action = SCOPE_ACTION[scope];
  const price = costOf(action);
  const affordable = credits.data ? canAfford(credits.data, action) : true;
  const shortfall = credits.data ? creditsShort(credits.data, action) : 0;
  const formattedPrice = t('mobile.plans.creditCount', { count: price }).replace(
    String(price),
    formatQty(locale, price, prefs),
  );
  const balance = credits.data ? formatQty(locale, totalCredits(credits.data), prefs) : null;
  const maxCookLabel =
    maxCook === null
      ? t('mobile.plans.anyCookTime')
      : t('mobile.plans.minutesValue', { minutes: maxCook }).replace(
          String(maxCook),
          formatMinutes(locale, maxCook, prefs),
        );

  const goBuyCredits = () => {
    setCreditsSheetOpen(false);
    router.push(`/buy-credits?action=${action}`);
  };

  const submit = async () => {
    if (!affordable) {
      setCreditsSheetOpen(true);
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
    startGeneration(started.id, scope);
    router.replace('/plans');
  };

  return (
    <Screen
      scroll
      footer={
        <GenerateFooter
          cost={formattedPrice}
          balance={balance}
          loading={generate.isPending}
          onSubmit={() => void submit()}
        />
      }
    >
      <Header title={t('mobile.plans.generateTitle')} onBack={() => router.back()} />

      <View style={{ gap: spacing.xl }}>
        <Section title={t('mobile.plans.scope')}>
          <SegmentedControl<PlanScope>
            value={scope}
            onChange={setScope}
            options={SCOPE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
          />
        </Section>

        <DateField
          label={t('mobile.plans.startDate')}
          value={startsOn}
          onChange={(value) => setStartsOn(value ?? todayISODate())}
          placeholder={t('mobile.plans.startDate')}
          clearLabel={t('mobile.common.clear')}
          doneLabel={t('common.done')}
          minimumDate={new Date(`${todayISODate()}T00:00:00`)}
        />

        <Section title={t('mobile.plans.slots')}>
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
        </Section>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{t('mobile.plans.servings')}</AppText>
            <AppText variant="caption" muted>
              {t('mobile.plans.householdOf', { count: servings }).replace(
                String(servings),
                formatQty(locale, servings, prefs),
              )}
            </AppText>
          </View>
          <QuantityStepper
            value={servings}
            onChange={setServings}
            min={1}
            accessibilityLabel={t('mobile.plans.servings')}
            decrementLabel={t('mobile.common.decrease')}
            incrementLabel={t('mobile.common.increase')}
          />
        </View>

        <SelectField
          label={t('mobile.plans.maxCookTime')}
          value={maxCookLabel}
          onPress={() => setMaxCookOpen(true)}
        />

        <Section title={t('mobile.plans.cuisines')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Chip
              label={t('mobile.plans.anyCuisine')}
              selected={cuisines.length === 0}
              onPress={() => setCuisines([])}
            />
            {CUISINES.map((cuisine) => (
              <Chip
                key={cuisine}
                label={t(`mobile.cuisines.${cuisine}` as MessageKey)}
                selected={cuisines.includes(cuisine)}
                onPress={() => setCuisines((prev) => toggle(prev, cuisine))}
              />
            ))}
          </View>
        </Section>
      </View>

      <Sheet
        visible={maxCookOpen}
        onClose={() => setMaxCookOpen(false)}
        title={t('mobile.plans.maxCookTime')}
      >
        <View>
          <ListRow
            title={t('mobile.plans.anyCookTime')}
            checked={maxCook === null}
            accessibilityState={{ selected: maxCook === null }}
            onPress={() => {
              setMaxCook(null);
              setMaxCookOpen(false);
            }}
          />
          {COOK_TIMES.map((minutes) => {
            const label = t('mobile.plans.minutesValue', { minutes }).replace(
              String(minutes),
              formatMinutes(locale, minutes, prefs),
            );
            return (
              <ListRow
                key={minutes}
                title={label}
                checked={maxCook === minutes}
                accessibilityState={{ selected: maxCook === minutes }}
                onPress={() => {
                  setMaxCook(minutes);
                  setMaxCookOpen(false);
                }}
              />
            );
          })}
        </View>
      </Sheet>
      <Sheet
        visible={creditsSheetOpen}
        onClose={() => setCreditsSheetOpen(false)}
        title={t('mobile.credits.outOfCreditsTitle')}
      >
        <OutOfCreditsPanel
          needed={shortfall > 0 ? formatQty(locale, shortfall, prefs) : null}
          cost={formatQty(locale, price, prefs)}
          balance={balance}
          onGetMore={goBuyCredits}
          onCancel={() => setCreditsSheetOpen(false)}
        />
      </Sheet>
    </Screen>
  );
}
