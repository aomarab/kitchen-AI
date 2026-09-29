import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import type { Ingredient, StorageLocation, Unit } from '@kitchen/contracts';
import {
  AppText,
  Button,
  Card,
  Chip,
  DateField,
  Field,
  FoodIcon,
  ListRow,
  Sheet,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useSearchIngredients } from '../../hooks/profile';
import type { ReviewRow } from '../../lib/capture';
import { applyIngredient, hasValidIngredientSelection, isNewReviewRow } from '../../lib/review';
import { ingredientName, localizedName, locationLabel } from '../../lib/format';
import { spacing } from '../../theme';
import { QuantityField } from './QuantityField';
import { UnitSelectField } from './UnitSelectField';

export interface ReviewSaveMeta {
  ingredientChanged: boolean;
}

export const REVIEW_EDIT_ACTION_MIN_HEIGHT = 44;

export interface ReviewEditSheetProps {
  visible: boolean;
  row: ReviewRow | null;
  locations: StorageLocation[];
  inline?: boolean;
  focusName?: boolean;
  onSave: (row: ReviewRow, meta: ReviewSaveMeta) => void;
  onCancel: () => void;
  onRemove: (row: ReviewRow) => void;
}

function ingredientChanged(before: ReviewRow, after: ReviewRow): boolean {
  return (
    before.ingredientId !== after.ingredientId ||
    before.nameEn !== after.nameEn ||
    before.nameAr !== after.nameAr ||
    before.rawName !== after.rawName ||
    before.category !== after.category
  );
}

function suggestionItem(ingredient: Ingredient) {
  return {
    nameEn: ingredient.canonicalNameEn,
    nameAr: ingredient.canonicalNameAr,
    category: ingredient.category,
  };
}

export function ReviewEditSheet({
  visible,
  row,
  locations,
  inline,
  focusName,
  onSave,
  onCancel,
  onRemove,
}: ReviewEditSheetProps) {
  const { t, locale } = useFormat();
  const nameRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState<ReviewRow | null>(row);
  const [term, setTerm] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [unitTouched, setUnitTouched] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const search = useSearchIngredients(term);

  useEffect(() => {
    setDraft(row);
    const label = row ? localizedName(locale, row.nameEn, row.nameAr) : '';
    setTerm(label);
    setSelectedLabel(row && !isNewReviewRow(row) ? label : null);
    setUnitTouched(false);
    setNameFocused(false);
  }, [locale, row]);

  useEffect(() => {
    if (!visible || !focusName) return;
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [focusName, visible, row?.tempId]);

  if (!visible || !row || !draft) return null;

  const chooseIngredient = (ingredient: Ingredient) => {
    setDraft((current) => {
      if (!current) return current;
      const next = applyIngredient(current, ingredient, { unitTouched });
      const label = ingredientName(locale, ingredient);
      setTerm(label);
      setSelectedLabel(label);
      setNameFocused(false);
      return next;
    });
  };

  const changeTerm = (text: string) => {
    setTerm(text);
    if (!hasValidIngredientSelection(text, selectedLabel)) setSelectedLabel(null);
  };

  const setUnit = (unit: Unit) => {
    setUnitTouched(true);
    setDraft((current) => (current ? { ...current, unit } : current));
  };

  const showSuggestions =
    nameFocused && term.trim().length > 0 && !hasValidIngredientSelection(term, selectedLabel);
  const suggestions = showSuggestions ? (search.data?.items ?? []).slice(0, 5) : [];
  const saveDisabled = draft.locationId === '' || !hasValidIngredientSelection(term, selectedLabel);

  const form = (
    <View style={{ gap: spacing.md }}>
      {inline ? (
        <AppText variant="heading" accessibilityRole="header">
          {t('mobile.review.editTitle')}
        </AppText>
      ) : null}

      <Field
        ref={nameRef}
        label={t('mobile.capture.searchIngredient')}
        value={term}
        onChangeText={changeTerm}
        placeholder={t('mobile.capture.searchIngredient')}
        autoCorrect={false}
        autoFocus={focusName}
        onFocus={() => setNameFocused(true)}
        onBlur={() => setNameFocused(false)}
      />

      {suggestions.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {suggestions.map((ingredient) => (
            <ListRow
              key={ingredient.id}
              title={ingredientName(locale, ingredient)}
              leading={<FoodIcon item={suggestionItem(ingredient)} size={36} />}
              onPress={() => chooseIngredient(ingredient)}
              showChevron
            />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <QuantityField
            value={draft.quantity}
            onChange={(quantity) =>
              setDraft((current) => (current ? { ...current, quantity } : current))
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <UnitSelectField value={draft.unit} onChange={setUnit} />
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('inventory.location')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {locations.map((loc) => (
            <Chip
              key={loc.id}
              label={locationLabel(t, loc)}
              selected={draft.locationId === loc.id}
              onPress={() =>
                setDraft((current) => (current ? { ...current, locationId: loc.id } : current))
              }
            />
          ))}
        </View>
      </View>

      <DateField
        label={t('inventory.expiryDate')}
        value={draft.expiresAt}
        onChange={(expiresAt) =>
          setDraft((current) => (current ? { ...current, expiresAt } : current))
        }
        placeholder={t('mobile.capture.noExpiry')}
        clearLabel={t('mobile.capture.clearDate')}
        doneLabel={t('mobile.capture.pickDate')}
      />

      <View
        style={{ minHeight: REVIEW_EDIT_ACTION_MIN_HEIGHT, flexDirection: 'row', gap: spacing.md }}
      >
        <Button
          title={t('mobile.review.remove')}
          variant="ghost"
          tone="danger"
          fullWidth={false}
          onPress={() => onRemove(draft)}
        />
        <Button
          title={t('common.save')}
          disabled={saveDisabled}
          style={{ flex: 1 }}
          onPress={() => onSave(draft, { ingredientChanged: ingredientChanged(row, draft) })}
        />
      </View>
    </View>
  );

  if (inline) {
    return <Card style={{ gap: spacing.md }}>{form}</Card>;
  }

  return (
    <Sheet visible={visible} onClose={onCancel} title={t('mobile.review.editTitle')}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
        {form}
      </ScrollView>
    </Sheet>
  );
}
