import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Ingredient, Unit } from '@kitchen/contracts';
import { AppText, Button, Card, Chip, Field, ListRow, QuantityStepper } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSearchIngredients } from '../../hooks/profile';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { ingredientName, unitLabel } from '../../lib/format';
import { isValidExpiryInput } from '../../lib/expiry';
import { errorMessageKey } from '../../lib/errors';
import { colors, spacing } from '../../theme';

const COMMON_UNITS: Unit[] = ['piece', 'g', 'kg', 'ml', 'l', 'bunch', 'can', 'packet'];

/** Manual add: search the catalog, then fill quantity, unit, location and expiry. */
export function ManualAdd() {
  const { t, locale } = useFormat();
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>('piece');
  const [locationId, setLocationId] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState('');

  const search = useSearchIngredients(term);
  const locations = useLocations();
  const create = useBulkCreateInventory();

  const expiryValid = isValidExpiryInput(expiresAt);

  const choose = (ingredient: Ingredient) => {
    setSelected(ingredient);
    setUnit(ingredient.defaultUnit);
    setLocationId(locations.data?.[0]?.id ?? '');
  };

  const confirm = () => {
    if (!selected || !locationId || !expiryValid) return;
    // `mutate`, not `void mutateAsync(...)`: the latter rejected into nothing,
    // so a failed add was an unhandled rejection and a screen that just sat
    // there. The failure now lands in `create.isError` and is rendered below.
    create.mutate(
      {
        items: [
          {
            ingredientId: selected.id,
            locationId,
            quantity,
            unit,
            expiresAt: expiresAt.trim() || null,
            source: 'manual',
            confidence: null,
            photoKey: null,
          },
        ],
      },
      { onSuccess: () => router.replace('/kitchen') },
    );
  };

  if (!selected) {
    return (
      <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md }}>
        <Field
          value={term}
          onChangeText={setTerm}
          placeholder={t('mobile.capture.searchIngredient')}
          autoCorrect={false}
          autoFocus
        />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
          {(search.data?.items ?? []).map((ingredient) => (
            <ListRow
              key={ingredient.id}
              title={ingredientName(locale, ingredient)}
              onPress={() => choose(ingredient)}
              showChevron
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">{ingredientName(locale, selected)}</AppText>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            decrementLabel={t('mobile.common.decrease')}
            incrementLabel={t('mobile.common.increase')}
          />
          <AppText muted>{unitLabel(t, unit)}</AppText>
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('inventory.unit')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {COMMON_UNITS.map((u) => (
              <Chip key={u} label={unitLabel(t, u)} selected={unit === u} onPress={() => setUnit(u)} />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('inventory.location')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(locations.data ?? []).map((loc) => (
              <Chip
                key={loc.id}
                label={loc.name}
                selected={locationId === loc.id}
                onPress={() => setLocationId(loc.id)}
              />
            ))}
          </View>
        </View>

        <Field
          label={t('inventory.expiryDate')}
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder={t('mobile.capture.noExpiry')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!expiryValid ? (
          <AppText variant="caption" style={{ color: colors.danger }}>
            {t('mobile.capture.expiryFormat')}
          </AppText>
        ) : null}
      </Card>

      <Button
        title={t('inventory.addItem')}
        icon="check"
        loading={create.isPending}
        disabled={!locationId || !expiryValid}
        onPress={confirm}
      />
      {create.isError ? (
        <AppText variant="caption" style={{ color: colors.danger }}>
          {t(errorMessageKey(create.error))}
        </AppText>
      ) : null}
      <Button title={t('common.cancel')} variant="ghost" onPress={() => setSelected(null)} />
    </ScrollView>
  );
}
