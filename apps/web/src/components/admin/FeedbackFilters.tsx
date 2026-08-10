'use client';

import type { FeedbackPlatform, FeedbackStatus } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { PLATFORM_KEY, STATUS_KEY } from '../../lib/feedback-labels';
import { Field, Select } from '../ui/Input';

export interface FeedbackFilterValue {
  status?: FeedbackStatus;
  rating?: number;
  platform?: FeedbackPlatform;
}

const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'resolved', 'wont_fix'];
const PLATFORMS: FeedbackPlatform[] = ['ios', 'android', 'web'];
const RATINGS = [1, 2, 3, 4, 5];

export function FeedbackFilters({
  value,
  onChange,
}: {
  value: FeedbackFilterValue;
  onChange: (next: FeedbackFilterValue) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="flex flex-wrap gap-4">
      <Field label={t('web.admin.filterStatus')} htmlFor="filter-status">
        <Select
          id="filter-status"
          value={value.status ?? ''}
          onChange={(e) =>
            onChange({ ...value, status: (e.target.value || undefined) as FeedbackStatus | undefined })
          }
        >
          <option value="">{t('web.admin.filterAll')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(STATUS_KEY[status])}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('web.admin.filterRating')} htmlFor="filter-rating">
        <Select
          id="filter-rating"
          value={value.rating ?? ''}
          onChange={(e) =>
            onChange({ ...value, rating: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">{t('web.admin.filterAll')}</option>
          {RATINGS.map((rating) => (
            <option key={rating} value={rating}>
              {rating}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('web.admin.filterPlatform')} htmlFor="filter-platform">
        <Select
          id="filter-platform"
          value={value.platform ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              platform: (e.target.value || undefined) as FeedbackPlatform | undefined,
            })
          }
        >
          <option value="">{t('web.admin.filterAll')}</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {t(PLATFORM_KEY[platform])}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
