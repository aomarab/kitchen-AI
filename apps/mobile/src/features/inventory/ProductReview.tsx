import { useState } from 'react';
import { View } from 'react-native';
import type { Locale, Translator } from '@kitchen/i18n';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { AppText, Button, Field, StarRating } from '../../components';
import { useProductFeedback, useSubmitProductFeedback } from '../../hooks/inventory';
import { errorMessageKey } from '../../lib/errors';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface ProductReviewProps {
  itemId: string;
  locale: Locale;
  t: Translator;
}

export function ProductReview({ itemId, locale, t }: ProductReviewProps) {
  const { colors } = useTheme();
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
          setDraftRating(null);
          setDraftMessage(null);
        },
      },
    );
  };

  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.xs }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading" accessibilityRole="header">
          {t('mobile.productReview.title')}
        </AppText>
        <AppText variant="caption" muted>
          {t('mobile.productReview.prompt')}
        </AppText>
      </View>

      <StarRating
        value={rating}
        onChange={setDraftRating}
        labelFor={(value) => t('mobile.productReview.star', { value })}
        disabled={submit.isPending}
      />

      <Field
        label={t('mobile.productReview.messageLabel')}
        value={message}
        onChangeText={setDraftMessage}
        placeholder={t('mobile.productReview.messagePlaceholder')}
        maxLength={FEEDBACK_MESSAGE_MAX}
        multiline
      />

      <Button
        title={mine ? t('mobile.productReview.update') : t('mobile.productReview.submit')}
        variant="secondary"
        disabled={rating < 1 || !changed}
        loading={submit.isPending}
        onPress={send}
      />

      <AppText variant="caption" muted>
        {t('mobile.productReview.vendorNote')}
      </AppText>

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
    </View>
  );
}
