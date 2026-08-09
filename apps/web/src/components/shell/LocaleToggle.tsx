'use client';

import { useLocale } from '../../lib/locale';
import { Button } from '../ui/Button';

/** Toggles between English and Arabic; the reload re-mirrors `<html dir>`. */
export function LocaleToggle({
  block = false,
  variant = 'outline',
}: {
  block?: boolean;
  variant?: 'outline' | 'outlineInverse';
}) {
  const { locale, setLocale, t } = useLocale();
  const next = locale === 'ar' ? 'en' : 'ar';
  return (
    <Button
      variant={variant}
      size="sm"
      block={block}
      onClick={() => setLocale(next)}
      aria-label={t('common.language')}
    >
      {next === 'ar' ? t('common.arabic') : t('common.english')}
    </Button>
  );
}
