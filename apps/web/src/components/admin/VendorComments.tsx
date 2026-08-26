'use client';

import { formatNumber } from '@kitchen/i18n';
import type { ProductComment } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/states';

/** The words themselves — what a vendor is actually sent. */
export function VendorComments({ comments }: { comments: ProductComment[] }) {
  const { t, locale } = useLocale();

  if (comments.length === 0) return <EmptyState title={t('web.admin.noComments')} />;

  return (
    <ul className="flex flex-col gap-2">
      {comments.map((comment) => (
        <li key={comment.id}>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg" aria-hidden="true">
                {'\u2605'.repeat(comment.rating)}
              </span>
              <span className="sr-only">{formatNumber(locale, comment.rating)}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(comment.createdAt).toLocaleDateString(locale)}
              </span>
            </div>
            {/*
              `dir="auto"` because a comment's language is the customer's, not
              the reader's: an Arabic complaint has to read right-to-left even
              while staff browse the console in English.
            */}
            <p className="mt-2 whitespace-pre-wrap text-sm" dir="auto">
              {comment.message}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
