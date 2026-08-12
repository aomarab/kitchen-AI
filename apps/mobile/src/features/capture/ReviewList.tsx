import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { InventoryItemInput, RecognitionSession, StorageLocation } from '@kitchen/contracts';
import { AppText, Badge, Button, Card, Chip, Field, QuantityStepper } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import type { CaptureSource } from '../../stores/capture';
import {
  buildInventoryInputs,
  includedCount,
  initialReviewRows,
  isLowConfidence,
  type ReviewRow,
} from '../../lib/capture';
import { localizedName, locationLabel, unitLabel } from '../../lib/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface ReviewListProps {
  session: RecognitionSession;
  source: CaptureSource;
  locations: StorageLocation[];
  submitting?: boolean;
  onConfirm: (items: InventoryItemInput[]) => void;
}

/**
 * The AI review list. Recognition rows are editable and each can be removed;
 * nothing reaches inventory until the user taps confirm, which is the only call
 * site of {@link buildInventoryInputs}. Low-confidence rows are flagged.
 */
export function ReviewList({ session, source, locations, submitting, onConfirm }: ReviewListProps) {
  const { t, locale } = useFormat();
  const { colors } = useTheme();
  const [rows, setRows] = useState<ReviewRow[]>(() => initialReviewRows(session, locations));

  const count = useMemo(() => includedCount(rows), [rows]);

  const update = (tempId: string, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row)));

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="caption" muted>
        {t('mobile.review.hint')}
      </AppText>

      {session.emptyPhotoKeys.length > 0 ? (
        <AppText variant="caption" muted>
          {t('mobile.review.emptyPhotos', { count: session.emptyPhotoKeys.length })}
        </AppText>
      ) : null}

      {rows.map((row) => (
        <Card key={row.tempId} tone={row.include ? 'surface' : 'alt'} style={{ gap: spacing.md }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">
                {localizedName(locale, row.nameEn, row.nameAr)}
              </AppText>
              {isLowConfidence(row.confidence) ? (
                <Badge tone="warn" label={t('capture.lowConfidence')} />
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobile.review.remove')}
              onPress={() => update(row.tempId, { include: !row.include })}
            >
              <AppText variant="label" color={row.include ? 'danger' : 'primaryText'}>
                {row.include ? t('mobile.review.remove') : t('common.add')}
              </AppText>
            </Pressable>
          </View>

          {row.include ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <QuantityStepper
                  value={row.quantity}
                  onChange={(quantity) => update(row.tempId, { quantity })}
                  decrementLabel={t('common.delete')}
                  incrementLabel={t('common.add')}
                />
                <AppText muted>{unitLabel(t, row.unit)}</AppText>
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
                      selected={row.locationId === loc.id}
                      onPress={() => update(row.tempId, { locationId: loc.id })}
                    />
                  ))}
                </View>
              </View>

              <Field
                label={t('inventory.expiryDate')}
                value={row.expiresAt ?? ''}
                onChangeText={(text) => update(row.tempId, { expiresAt: text.trim() || null })}
                placeholder={t('mobile.capture.noExpiry')}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : null}
        </Card>
      ))}

      <View style={{ height: 1, backgroundColor: colors.border }} />
      <Button
        title={t('mobile.review.addCount', { count })}
        icon="check"
        disabled={count === 0}
        loading={submitting}
        onPress={() => onConfirm(buildInventoryInputs(rows, source))}
      />
    </View>
  );
}
