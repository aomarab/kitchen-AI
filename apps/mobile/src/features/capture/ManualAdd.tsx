import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Ingredient, Unit } from '@kitchen/contracts';
import { AppText, Button, Chip, DateField, ListRow, SearchField, Toggle } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSearchIngredients } from '../../hooks/profile';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { ingredientName, locationLabel } from '../../lib/format';
import { isValidExpiryInput } from '../../lib/expiry';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { QuantityField } from './QuantityField';
import { UnitSelectField } from './UnitSelectField';

/** Manual add: search the catalog, then fill quantity, unit, location and expiry. */
export function ManualAdd() {
  const { t, locale } = useFormat();
  const { colors } = useTheme();
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
      <View style={{ flex: 1, padding: spacing.gutter, gap: spacing.lg }}>
        <SearchField
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
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.gutter, gap: spacing.lg }}>
        <View style={{ gap: spacing.md }}>
          <SearchField
            value={ingredientName(locale, selected)}
            editable={false}
            placeholder={t('mobile.capture.searchIngredient')}
            clearAccessibilityLabel={t('common.cancel')}
            onClear={() => setSelected(null)}
          />

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <QuantityField value={quantity} onChange={setQuantity} />
            </View>
            <View style={{ flex: 1 }}>
              <UnitSelectField value={unit} onChange={setUnit} />
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
                  label={locationLabel(t, loc)}
                  selected={locationId === loc.id}
                  onPress={() => setLocationId(loc.id)}
                />
              ))}
            </View>
          </View>

          <DateField
            label={t('inventory.expiryDate')}
            value={expiresAt || null}
            onChange={(next) => setExpiresAt(next ?? '')}
            placeholder={t('mobile.capture.noExpiry')}
            clearLabel={t('mobile.capture.clearDate')}
            doneLabel={t('mobile.capture.pickDate')}
          />

          <View
            style={{
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: colors.rowline,
            }}
          >
            <AppText variant="body">{t('mobile.capture.noExpiry')}</AppText>
            <Toggle
              value={expiresAt.trim() === ''}
              accessibilityLabel={t('mobile.capture.noExpiry')}
              onValueChange={(value) => {
                if (value) setExpiresAt('');
              }}
            />
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          padding: spacing.gutter,
          paddingTop: spacing.sm,
          gap: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.rowline,
        }}
      >
        <Button
          title={t('mobile.capture.addToKitchen')}
          loading={create.isPending}
          disabled={!locationId || !expiryValid}
          onPress={confirm}
        />
        {create.isError ? (
          <AppText variant="caption" style={{ color: colors.danger }}>
            {t(errorMessageKey(create.error))}
          </AppText>
        ) : null}
        <AppText variant="caption" muted center>
          {t('mobile.capture.confirmBody')}
        </AppText>
      </View>
    </View>
  );
}
