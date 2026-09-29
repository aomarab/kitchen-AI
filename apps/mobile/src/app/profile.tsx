import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Cuisine, DietaryPreference, HealthGoal } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Button,
  Chip,
  Field,
  ListGroup,
  QuantityStepper,
  SectionLabel,
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
  const allergyValue = allergy.trim();
  const canAddAllergy = allergyValue.length > 0 && !data.allergies.includes(allergyValue);
  const saveAllergy = () => {
    if (canAddAllergy) {
      update.mutate({ allergies: [...data.allergies, allergyValue] });
    }
    setAllergy('');
  };
  const saveAndReturn = () => {
    if (canAddAllergy) {
      update.mutate(
        { allergies: [...data.allergies, allergyValue] },
        { onSuccess: () => router.back() },
      );
      return;
    }
    router.back();
  };

  const chips = <T extends string>(
    items: readonly T[],
    selected: readonly T[],
    keyPrefix: string,
  ) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {items.map((item) => (
        <Chip
          key={item}
          label={t(`${keyPrefix}.${item}` as MessageKey)}
          selected={selected.includes(item)}
          onPress={() => {
            if (keyPrefix === 'mobile.diet') {
              update.mutate({ dietaryPrefs: toggle(data.dietaryPrefs, item as DietaryPreference) });
            } else if (keyPrefix === 'mobile.healthGoals') {
              update.mutate({ healthGoals: toggle(data.healthGoals, item as HealthGoal) });
            } else {
              update.mutate({ cuisinePrefs: toggle(data.cuisinePrefs, item as Cuisine) });
            }
          }}
        />
      ))}
    </View>
  );

  return (
    <Screen
      scroll
      footer={
        <Button
          title={t('common.save')}
          leadingIcon="check"
          loading={update.isPending && canAddAllergy}
          onPress={saveAndReturn}
        />
      }
    >
      <Header title={t('profile.title')} onBack={() => router.back()} />

      <ListGroup>
        <ToggleRow
          label={t('profile.halal')}
          value={data.halal}
          onValueChange={(halal) => update.mutate({ halal })}
        />
      </ListGroup>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText variant="body" style={{ flex: 1 }}>
          {t('profile.householdSize')}
        </AppText>
        <QuantityStepper
          value={data.householdSize}
          min={1}
          onChange={(householdSize) => update.mutate({ householdSize })}
          accessibilityLabel={t('profile.householdSize')}
          decrementLabel={t('mobile.common.decrease')}
          incrementLabel={t('mobile.common.increase')}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('profile.dietary')}</SectionLabel>
        {chips(DIETS, data.dietaryPrefs, 'mobile.diet')}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('profile.healthGoals')}</SectionLabel>
        {chips(GOALS, data.healthGoals, 'mobile.healthGoals')}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('profile.cuisines')}</SectionLabel>
        {chips(CUISINES, data.cuisinePrefs, 'mobile.cuisines')}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('profile.allergies')}</SectionLabel>
        <AppText variant="caption" muted>
          {t('profile.allergiesHint')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {data.allergies.map((item) => (
            <Chip
              key={item}
              label={item}
              icon="x"
              onPress={() => update.mutate({ allergies: data.allergies.filter((a) => a !== item) })}
            />
          ))}
        </View>
        <Field
          label={t('mobile.profile.addAllergy')}
          value={allergy}
          onChangeText={setAllergy}
          placeholder={t('profile.allergies')}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={saveAllergy}
        />
      </View>
    </Screen>
  );
}
