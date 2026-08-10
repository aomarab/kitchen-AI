'use client';

import { useState } from 'react';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { translateErrorKey } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { resolveErrorKey } from '../../lib/errors';
import { APP_VERSION } from '../../lib/app-version';
import { useSubmitFeedback } from '../../hooks/feedback';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { StarRating } from '../ui/StarRating';

export function FeedbackForm() {
  const { t, locale } = useLocale();
  const submit = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');

  if (submit.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('web.feedback.successTitle')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.feedback.successBody')}</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setRating(0);
            setMessage('');
            submit.reset();
          }}
        >
          {t('web.feedback.another')}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader>
        <CardTitle>{t('web.feedback.title')}</CardTitle>
      </CardHeader>

      <StarRating
        value={rating}
        onChange={setRating}
        disabled={submit.isPending}
        legend={t('web.feedback.ratingLabel')}
        labelFor={(value) => t('web.feedback.star', { value })}
      />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">{t('web.feedback.messageLabel')}</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={5}
          placeholder={t('web.feedback.messagePlaceholder')}
          disabled={submit.isPending}
          className="w-full rounded border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span className="text-xs text-muted-foreground">
          {t('web.feedback.remaining', { count: FEEDBACK_MESSAGE_MAX - message.length })}
        </span>
      </label>

      <p className="text-xs text-muted-foreground">{t('web.feedback.privacyNote')}</p>

      {submit.isError ? (
        <p role="alert" className="text-sm text-danger">
          {translateErrorKey(locale, resolveErrorKey(submit.error))}
        </p>
      ) : null}

      <div>
        <Button
          disabled={rating === 0 || submit.isPending}
          onClick={() => {
            submit.mutate({
              rating,
              message: message.trim() ? message.trim() : undefined,
              platform: 'web',
              appVersion: APP_VERSION,
              locale,
            });
          }}
        >
          {t('web.feedback.submit')}
        </Button>
      </div>
    </Card>
  );
}
