import { useState } from 'react';
import { View } from 'react-native';
import type { Locale, Translator } from '@kitchen/i18n';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { AppText, Button, Card, Field, StarRating } from '../../components';
import { useProductFeedback, useSubmitProductFeedback } from '../../hooks/inventory';
import { errorMessageKey } from '../../lib/errors';
import { colors, spacing } from '../../theme';

export interface ProductReviewProps {
  itemId: string;
  locale: Locale;
  t: Translator;
}

/**
 * Rate the product an item is, for the brand that makes it.
 *
 * Deliberately not part of the edit card above it. Everything there is about
 * *your copy* of the food — where it is, when it expires — and saving it is a
 * correction. This is about the product itself and it leaves the household, so
 * it gets its own card, its own button, and a sentence saying where it goes.
 */
export function ProductReview({ itemId, locale, t }: ProductReviewProps) {
  const summary = useProductFeedback(itemId);
  const submit = useSubmitProductFeedback(itemId);

  const mine = summary.data?.mine ?? null;
  const [draftRating, setDraftRating] = useState<number | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  const rating = draftRating ?? mine?.rating ?? 0;
  const message = draftMessage ?? mine?.message ?? '';
  const changed = rating !== (mine?.rating ?? 0) || message !== (mine?.message ?? '');

  const send = () => {
    if (rating < 1) return;
    submit.mutate(
      { rating, message: message.trim() ? message.trim() : undefined, locale },
      {
        onSuccess: () => {
          // Drop the drafts so the card follows the server's copy from here on.
          setDraftRating(null);
          setDraftMessage(null);
        },
      },
    );
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="label" muted>
        {t('mobile.productReview.title')}
      </AppText>

      <View style={{ gap: spacing.xs }}>
        <AppText>{t('mobile.productReview.prompt')}</AppText>
        <StarRating
          value={rating}
          onChange={setDraftRating}
          labelFor={(value) => t('mobile.productReview.star', { value })}
          disabled={submit.isPending}
        />
      </View>

      <Field
        label={t('mobile.productReview.messageLabel')}
        value={message}
        onChangeText={setDraftMessage}
        placeholder={t('mobile.productReview.messagePlaceholder')}
        maxLength={FEEDBACK_MESSAGE_MAX}
        multiline
      />

      <AppText variant="caption" muted>
        {t('mobile.productReview.vendorNote')}
      </AppText>

      <Button
        title={mine ? t('mobile.productReview.update') : t('mobile.productReview.submit')}
        icon="star"
        disabled={rating < 1 || !changed}
        loading={submit.isPending}
        onPress={send}
      />

      {submit.isError ? (
        <AppText variant="caption" style={{ color: colors.danger }}>
          {t(errorMessageKey(submit.error))}
        </AppText>
      ) : null}
      {submit.isSuccess && !changed ? (
        <AppText variant="caption" style={{ color: colors.success }}>
          {t('mobile.productReview.saved')}
        </AppText>
      ) : null}

      <AppText variant="caption" muted>
        {summary.data && summary.data.count > 0
          ? t('mobile.productReview.others', {
              count: summary.data.count,
              rating: summary.data.averageRating ?? 0,
            })
          : t('mobile.productReview.othersNone')}
      </AppText>
    </Card>
  );
}
