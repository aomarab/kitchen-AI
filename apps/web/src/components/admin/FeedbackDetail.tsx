'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FeedbackStatus } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { PLATFORM_KEY, STATUS_KEY } from '../../lib/feedback-labels';
import { useFeedbackDetail, useUpdateFeedback } from '../../hooks/admin';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Select } from '../ui/Input';
import { LoadingState, ErrorState } from '../ui/states';

const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'resolved', 'wont_fix'];

export function FeedbackDetail({ id }: { id: string }) {
  const { t, locale } = useLocale();
  const query = useFeedbackDetail(id);
  const update = useUpdateFeedback(id);
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const item = query.data;
  const draftStatus = status ?? item.status;
  const draftNote = note ?? item.adminNote ?? '';
  const statusDirty = draftStatus !== item.status;
  const noteDirty = draftNote !== (item.adminNote ?? '');
  const dirty = statusDirty || noteDirty;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link href="/admin" className="text-sm text-primary-text hover:underline">
        {t('web.admin.backToList')}
      </Link>

      <Card className="flex flex-col gap-3">
        <CardHeader>
          <CardTitle>
            <span aria-hidden="true">{'\u2605'.repeat(item.rating)}</span>
            <span className="sr-only">{item.rating}</span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t('web.admin.submittedOn', { date: new Date(item.createdAt).toLocaleString(locale) })}
          </span>
        </CardHeader>

        {/* The reader's direction is not the author's — see FeedbackList. */}
        <p dir="auto" className="whitespace-pre-wrap text-sm text-foreground">
          {item.message ?? t('web.admin.noMessage')}
        </p>

        <p className="text-xs text-muted-foreground">
          {t('web.admin.context', {
            version: item.appVersion,
            platform: t(PLATFORM_KEY[item.platform]),
            locale: item.locale,
          })}
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <CardHeader>
          <CardTitle>{t('web.admin.submitter')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-foreground">{item.submitter.displayName}</p>
        <p className="text-sm text-muted-foreground">{item.submitter.email}</p>
        <p className="text-xs text-muted-foreground">
          {t('web.admin.joined', { date: new Date(item.submitter.joinedAt).toLocaleDateString(locale) })}
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label={t('web.admin.filterStatus')} htmlFor="detail-status">
          <Select
            id="detail-status"
            value={draftStatus}
            onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {t(STATUS_KEY[option])}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t('web.admin.adminNote')}</span>
          <textarea
            value={draftNote}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            dir="auto"
            placeholder={t('web.admin.adminNotePlaceholder')}
            className="w-full rounded border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>

        <p className="text-xs text-muted-foreground">
          {item.reviewedAt
            ? t('web.admin.reviewedBy', { date: new Date(item.reviewedAt).toLocaleString(locale) })
            : t('web.admin.neverReviewed')}
        </p>

        <div className="flex items-center gap-3">
          <Button
            disabled={!dirty || update.isPending}
            onClick={() =>
              update.mutate({
                ...(statusDirty ? { status: draftStatus } : {}),
                // Only send a field the reviewer actually touched. The API
                // writes any key that is not `undefined`, so sending the
                // untouched note back as '' would overwrite a null note with
                // an empty string — two different states in the schema.
                ...(noteDirty ? { adminNote: draftNote.trim() === '' ? null : draftNote } : {}),
              })
            }
          >
            {t('web.admin.save')}
          </Button>
          {update.isSuccess && !dirty ? (
            <span className="text-sm text-success">{t('web.admin.saved')}</span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
