import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type {
  InventoryItemInput,
  InventorySource,
  RecognitionSession,
  StorageLocation,
} from '@kitchen/contracts';
import { AppText, Button } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { buildInventoryInputs, initialReviewRows, type ReviewRow } from '../../lib/capture';
import {
  focusIndex,
  needsAnswer,
  newReviewRow,
  orderedReviewRows,
  reviewHeadlineCount,
  reviewScrollTarget,
  unansweredCount,
} from '../../lib/review';
import { localizedName } from '../../lib/format';
import { spacing } from '../../theme';
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

export const REVIEW_FOOTER_ACTION_MIN_HEIGHT = 44;

interface EditState {
  row: ReviewRow;
  focusName: boolean;
}

export interface ReviewListState {
  rows: ReviewRow[];
  includedRows: ReviewRow[];
  orderedRows: ReviewRow[];
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
  }, [locationIds, session.id]);

  const includedRows = useMemo(() => rows.filter((row) => row.include), [rows]);
  const orderedRows = useMemo(() => orderedReviewRows(rows, answered), [answered, rows]);
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
    orderedRows,
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

export function ReviewFooter({
  state,
  submitting,
}: {
  state: Pick<ReviewListState, 'count' | 'unanswered' | 'confirm' | 'openAdd'>;
  submitting?: boolean;
}) {
  const { t } = useFormat();
  const disabled = state.count === 0 || state.unanswered > 0;
  return (
    <View style={{ minHeight: REVIEW_FOOTER_ACTION_MIN_HEIGHT, gap: spacing.sm }}>
      {state.unanswered > 0 ? (
        <AppText variant="caption" color="warn" center>
          {t('mobile.review.resolveFirst', { count: state.unanswered })}
        </AppText>
      ) : null}
      <Button
        title={t('mobile.review.addCount', { count: state.count })}
        leadingIcon="check"
        disabled={disabled}
        loading={submitting}
        onPress={state.confirm}
      />
      <Button
        title={t('mobile.review.addSomething')}
        variant="ghost"
        fullWidth={false}
        style={{ alignSelf: 'center' }}
        onPress={state.openAdd}
      />
    </View>
  );
}

function ReviewRows({
  rows,
  review,
  locations,
  focusedIndex,
  onTileLayout,
}: {
  rows: ReviewRow[];
  review: ReviewListState;
  locations: StorageLocation[];
  focusedIndex: number;
  onTileLayout?: (tempId: string, index: number, y: number) => void;
}) {
  const { locale } = useFormat();
  const listY = useRef(0);
  return (
    <View
      onLayout={(event) => {
        listY.current = event.nativeEvent.layout.y;
      }}
    >
      {rows.map((row, index) => {
        const name = localizedName(locale, row.nameEn, row.nameAr);
        const shouldAsk = needsAnswer(row, review.answered);
        return (
          <View
            key={row.tempId}
            onLayout={(event) => {
              const rowY = event.nativeEvent.layout.y;
              if (focusedIndex === index) {
                onTileLayout?.(row.tempId, index, reviewScrollTarget(listY.current, rowY));
              }
            }}
          >
            {shouldAsk ? (
              <QuestionTile
                name={name}
                onYes={() => review.answerYes(row)}
                onNo={() => review.openEdit(row, { focusName: true })}
              />
            ) : (
              <ReviewTile
                row={row}
                location={locations.find((location) => location.id === row.locationId)}
                onPress={() => review.openEdit(row)}
                onQuantityChange={(quantity) => review.updateQuantity(row.tempId, quantity)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Confirmation list. Nothing reaches inventory until ReviewFooter calls confirm. */
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
  const { t } = useFormat();
  const internal = useReviewListState({ session, source, locations, onConfirm });
  const review = state ?? internal;
  const presentation = editPresentation ?? (source === 'assistant' ? 'inline' : 'sheet');
  const rows = review.orderedRows;
  const focusedIndex = focusIndex(rows, focus);

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="display">
        {t('mobile.review.headline')}{' '}
        <AppText variant="display" color="primaryText">
          {t('mobile.review.headlineAccent', { count: review.count })}
        </AppText>{' '}
        {t('mobile.review.headlineTail')}
      </AppText>

      <AppText variant="caption" color="textMuted">
        {t('mobile.review.hint')}
      </AppText>

      {session.emptyPhotoKeys.length > 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('mobile.review.emptyPhotos', { count: session.emptyPhotoKeys.length })}
        </AppText>
      ) : null}

      <ReviewRows
        rows={rows}
        review={review}
        locations={locations}
        focusedIndex={focusedIndex}
        onTileLayout={onTileLayout}
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
