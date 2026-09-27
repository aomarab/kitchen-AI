import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import type {
  InventoryItemInput,
  InventorySource,
  RecognitionSession,
  StorageLocation,
} from '@kitchen/contracts';
import { AppText, Bento, Button, Icon } from '../../components';
import type { TileSpan } from '../../components/Tile';
import { useFormat } from '../../hooks/useFormat';
import { buildInventoryInputs, initialReviewRows, type ReviewRow } from '../../lib/capture';
import {
  focusIndex,
  needsAnswer,
  newReviewRow,
  reviewHeadlineCount,
  unansweredCount,
} from '../../lib/review';
import { localizedName } from '../../lib/format';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { QuestionTile } from './QuestionTile';
import { ReviewEditSheet, type ReviewSaveMeta } from './ReviewEditSheet';
import { ReviewTile } from './ReviewTile';

export interface ReviewListProps {
  session: RecognitionSession;
  source: InventorySource;
  locations: StorageLocation[];
  submitting?: boolean;
  onConfirm: (items: InventoryItemInput[]) => void;
  footer?: 'inline' | 'none';
  editPresentation?: 'sheet' | 'inline';
  state?: ReviewListState;
  focus?: string;
  onTileLayout?: (tempId: string, index: number, y: number) => void;
}

interface EditState {
  row: ReviewRow;
  focusName: boolean;
}

export interface ReviewListState {
  rows: ReviewRow[];
  includedRows: ReviewRow[];
  answered: ReadonlySet<string>;
  count: number;
  unanswered: number;
  edit: EditState | null;
  answerYes: (row: ReviewRow) => void;
  openEdit: (row: ReviewRow, options?: { focusName?: boolean }) => void;
  openAdd: () => void;
  updateQuantity: (tempId: string, quantity: number) => void;
  cancelEdit: () => void;
  saveEdit: (row: ReviewRow, meta: ReviewSaveMeta) => void;
  removeEdit: (row: ReviewRow) => void;
  confirm: () => void;
}

function locationsKey(locations: readonly StorageLocation[]): string {
  return locations.map((location) => location.id).join('|');
}

export function useReviewListState({
  session,
  source,
  locations,
  onConfirm,
}: Pick<ReviewListProps, 'session' | 'source' | 'locations' | 'onConfirm'>): ReviewListState {
  const [rows, setRows] = useState<ReviewRow[]>(() => initialReviewRows(session, locations));
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());
  const [edit, setEdit] = useState<EditState | null>(null);
  const locationIds = locationsKey(locations);

  useEffect(() => {
    setRows(initialReviewRows(session, locations));
    setAnswered(new Set());
    setEdit(null);
    // Reset only when the recognition session or the location identity changes;
    // otherwise an inline [] fallback from a caller would erase edits every render.
  }, [locationIds, session.id]);

  const includedRows = useMemo(() => rows.filter((row) => row.include), [rows]);
  const count = useMemo(() => reviewHeadlineCount(rows), [rows]);
  const unanswered = useMemo(() => unansweredCount(rows, answered), [answered, rows]);

  const updateQuantity = useCallback((tempId: string, quantity: number) => {
    setRows((prev) => prev.map((row) => (row.tempId === tempId ? { ...row, quantity } : row)));
  }, []);

  const answerYes = useCallback((row: ReviewRow) => {
    setAnswered((prev) => new Set(prev).add(row.tempId));
  }, []);

  const openEdit = useCallback((row: ReviewRow, options?: { focusName?: boolean }) => {
    setEdit({ row, focusName: !!options?.focusName });
  }, []);

  const openAdd = useCallback(() => {
    setEdit({ row: newReviewRow(locations), focusName: true });
  }, [locations]);

  const cancelEdit = useCallback(() => setEdit(null), []);

  const saveEdit = useCallback((next: ReviewRow, meta: ReviewSaveMeta) => {
    setRows((prev) => {
      const exists = prev.some((row) => row.tempId === next.tempId);
      if (!exists) return [...prev, next];
      return prev.map((row) => (row.tempId === next.tempId ? next : row));
    });
    if (meta.ingredientChanged) {
      setAnswered((prev) => new Set(prev).add(next.tempId));
    }
    setEdit(null);
  }, []);

  const removeEdit = useCallback((row: ReviewRow) => {
    setRows((prev) => {
      const exists = prev.some((candidate) => candidate.tempId === row.tempId);
      if (!exists) return prev;
      return prev.map((candidate) =>
        candidate.tempId === row.tempId ? { ...candidate, include: false } : candidate,
      );
    });
    setEdit(null);
  }, []);

  const confirm = useCallback(() => {
    onConfirm(buildInventoryInputs(rows, source));
  }, [onConfirm, rows, source]);

  return {
    rows,
    includedRows,
    answered,
    count,
    unanswered,
    edit,
    answerYes,
    openEdit,
    openAdd,
    updateQuantity,
    cancelEdit,
    saveEdit,
    removeEdit,
    confirm,
  };
}

function ReviewAddTile({ onPress }: { onPress: () => void; span?: TileSpan }) {
  const { t } = useFormat();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('mobile.review.addSomething')}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 140,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.border,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        opacity: pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Icon name="plus" size={24} color={colors.text} />
      <AppText variant="bodyStrong">{t('mobile.review.addSomething')}</AppText>
    </Pressable>
  );
}

interface TileDescriptor {
  key: string;
  tempId?: string;
  element: ReactElement;
}

function ReviewBento({
  tiles,
  onTileLayout,
}: {
  tiles: TileDescriptor[];
  onTileLayout?: (tempId: string, index: number, y: number) => void;
}) {
  return (
    <Bento
      onRowLayout={(indices, y) => {
        for (const index of indices) {
          const tile = tiles[index];
          if (tile?.tempId) onTileLayout?.(tile.tempId, index, y);
        }
      }}
    >
      {tiles.map((tile) => tile.element)}
    </Bento>
  );
}

export function ReviewFooter({
  state,
  submitting,
}: {
  state: Pick<ReviewListState, 'count' | 'unanswered' | 'confirm'>;
  submitting?: boolean;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const disabled = state.count === 0 || state.unanswered > 0;
  return (
    <View style={{ gap: spacing.sm }}>
      {state.unanswered > 0 ? (
        <AppText variant="caption" color="warn" center>
          {t('mobile.review.resolveFirst', { count: state.unanswered })}
        </AppText>
      ) : null}
      <Button
        title={t('mobile.review.addCount', { count: state.count })}
        icon="check"
        disabled={disabled}
        loading={submitting}
        onPress={state.confirm}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
      >
        <Icon name="info" size={14} color={colors.textMuted} />
        <AppText variant="caption" muted center>
          {t('mobile.review.savedOnAdd')}
        </AppText>
      </View>
    </View>
  );
}

/** Bento confirmation list. Nothing reaches inventory until ReviewFooter calls confirm. */
export function ReviewList({
  session,
  source,
  locations,
  submitting,
  onConfirm,
  footer = 'inline',
  editPresentation,
  state,
  focus,
  onTileLayout,
}: ReviewListProps) {
  const { t, locale } = useFormat();
  const { tintIn } = useTheme();
  const internal = useReviewListState({ session, source, locations, onConfirm });
  const review = state ?? internal;
  const presentation = editPresentation ?? (source === 'assistant' ? 'inline' : 'sheet');
  const focusedIndex = focusIndex(review.rows, focus);

  const tiles: TileDescriptor[] = review.includedRows.map((row, index) => {
    const name = localizedName(locale, row.nameEn, row.nameAr);
    const shouldAsk = needsAnswer(row, review.answered);
    const element = shouldAsk ? (
      <QuestionTile
        key={row.tempId}
        span={1}
        name={name}
        onYes={() => review.answerYes(row)}
        onNo={() => review.openEdit(row, { focusName: true })}
      />
    ) : (
      <ReviewTile
        key={row.tempId}
        span={1}
        row={row}
        tint={tintIn(index)}
        location={locations.find((location) => location.id === row.locationId)}
        onPress={() => review.openEdit(row)}
        onQuantityChange={(quantity) => review.updateQuantity(row.tempId, quantity)}
      />
    );
    return { key: row.tempId, tempId: row.tempId, element };
  });

  tiles.push({
    key: 'add-something',
    element: <ReviewAddTile key="add-something" span={1} onPress={review.openAdd} />,
  });

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="hero">
        {t('mobile.review.headline')}{' '}
        <AppText variant="hero" color="primaryText">
          {t('mobile.review.headlineAccent', { count: review.count })}
        </AppText>
        {'\n'}
        {t('mobile.review.headlineTail')}
      </AppText>

      {session.emptyPhotoKeys.length > 0 ? (
        <AppText variant="caption" muted>
          {t('mobile.review.emptyPhotos', { count: session.emptyPhotoKeys.length })}
        </AppText>
      ) : null}

      <ReviewBento
        tiles={tiles}
        onTileLayout={(tempId, index, y) => {
          if (focusedIndex === index) onTileLayout?.(tempId, index, y);
        }}
      />

      <ReviewEditSheet
        visible={!!review.edit}
        row={review.edit?.row ?? null}
        locations={locations}
        inline={presentation === 'inline'}
        focusName={review.edit?.focusName}
        onSave={review.saveEdit}
        onCancel={review.cancelEdit}
        onRemove={review.removeEdit}
      />

      {footer === 'inline' ? <ReviewFooter state={review} submitting={submitting} /> : null}
    </View>
  );
}
