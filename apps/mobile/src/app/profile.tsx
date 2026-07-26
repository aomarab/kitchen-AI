import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Cuisine, DietaryPreference, HealthGoal } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Card,
  Chip,
  Field,
  QuantityStepper,
  ToggleRow,
  LoadingState,
  ErrorState,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import { useProfile, useUpdateProfile } from '../hooks/profile';
import { spacing } from '../theme';

const DIETS: DietaryPreference[] = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'low_carb',
  'gluten_free',
  'dairy_free',
  'low_sodium',
  'high_protein',
];
const GOALS: HealthGoal[] = [
  'weight_loss',
  'muscle_gain',
  'maintenance',
  'diabetic_friendly',
  'heart_healthy',
];
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

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function Profile() {
  const { t } = useFormat();
  const router = useRouter();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [allergy, setAllergy] = useState('');

  if (profile.isLoading) {
    return (
      <Screen>
        <Header title={t('profile.title')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <Screen>
        <Header title={t('profile.title')} onBack={() => router.back()} />
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const data = profile.data;

  return (
    <Screen scroll>
      <Header title={t('profile.title')} onBack={() => router.back()} />

      <Card style={{ gap: spacing.md }}>
        <ToggleRow
          label={t('profile.halal')}
          value={data.halal}
          onValueChange={(halal) => update.mutate({ halal })}
        />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('profile.householdSize')}
          </AppText>
          <QuantityStepper
            value={data.householdSize}
            min={1}
            onChange={(householdSize) => update.mutate({ householdSize })}
            decrementLabel={t('mobile.common.decrease')}
            incrementLabel={t('mobile.common.increase')}
          />
        </View>
      </Card>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading">{t('profile.dietary')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {DIETS.map((diet) => (
            <Chip
              key={diet}
              label={t(`mobile.diet.${diet}` as MessageKey)}
              selected={data.dietaryPrefs.includes(diet)}
              onPress={() => update.mutate({ dietaryPrefs: toggle(data.dietaryPrefs, diet) })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading">{t('profile.healthGoals')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {GOALS.map((goal) => (
            <Chip
              key={goal}
              label={t(`mobile.healthGoals.${goal}` as MessageKey)}
              selected={data.healthGoals.includes(goal)}
              onPress={() => update.mutate({ healthGoals: toggle(data.healthGoals, goal) })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading">{t('profile.cuisines')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {CUISINES.map((cuisine) => (
            <Chip
              key={cuisine}
              label={t(`mobile.cuisines.${cuisine}` as MessageKey)}
              selected={data.cuisinePrefs.includes(cuisine)}
              onPress={() => update.mutate({ cuisinePrefs: toggle(data.cuisinePrefs, cuisine) })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading">{t('profile.allergies')}</AppText>
        <AppText variant="caption" muted>
          {t('profile.allergiesHint')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {data.allergies.map((item) => (
            <Chip
              key={item}
              label={item}
              selected
              onPress={() =>
                update.mutate({ allergies: data.allergies.filter((a) => a !== item) })
              }
            />
          ))}
        </View>
        <Field
          value={allergy}
          onChangeText={setAllergy}
          placeholder={t('profile.allergies')}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            const value = allergy.trim();
            if (value && !data.allergies.includes(value)) {
              update.mutate({ allergies: [...data.allergies, value] });
            }
            setAllergy('');
          }}
        />
      </View>
    </Screen>
  );
}
