'use client';

import { useState } from 'react';
import type { Recipe } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { DirectionalIcon } from '../ui/DirectionalIcon';
import { ProgressBar } from '../ui/ProgressBar';
import { ChevronIcon, CloseIcon, ClockIcon } from '../ui/icons';

/** Full-screen, high-contrast step-by-step mode for cooking (spec §6.3). */
export function CookMode({ recipe, onExit }: { recipe: Recipe; onExit: () => void }) {
  const { t, locale } = useLocale();
  const [step, setStep] = useState(0);
  const current = recipe.steps[step]!;
  const total = recipe.steps.length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{recipe.title}</h2>
        <IconButton label={t('web.recipe.exitCookMode')} onClick={onExit}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6">
        <p className="text-sm font-medium text-muted-foreground">
          {t('web.recipe.stepCounter', {
            current: formatNumber(locale, step + 1),
            total: formatNumber(locale, total),
          })}
        </p>
        <p className="text-2xl leading-relaxed">{current.text}</p>
        {current.durationMinutes ? (
          <Button variant="outline" className="w-fit">
            <ClockIcon className="h-4 w-4" />
            {t('web.recipe.startTimer', { minutes: formatNumber(locale, current.durationMinutes) })}
          </Button>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <ProgressBar value={(step + 1) / total} className="mb-4" />
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <DirectionalIcon icon={ChevronIcon} className="rotate-180 h-4 w-4" />
            {t('web.recipe.prevStep')}
          </Button>
          {step < total - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(total - 1, s + 1))}>
              {t('web.recipe.nextStep')}
              <DirectionalIcon icon={ChevronIcon} className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={onExit}>{t('common.done')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
