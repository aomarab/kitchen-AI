'use client';

import {
  ASSISTANT_PERSONAS,
  assistantPersonaSchema,
  type AssistantPersona,
} from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { useProfile, useUpdateProfile } from '../../hooks/settings';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { LoadingState, ErrorState } from '../ui/states';

/**
 * Choose the voice the live assistant speaks with (voice & personalization
 * spec).
 *
 * The list is derived from the contract catalog rather than hand-written, so a
 * persona added to the enum appears here without anyone remembering to add it —
 * and, because names come from the i18n catalogs which are typed against each
 * other, one added without an Arabic name fails the build instead.
 *
 * There is no preview button. Previewing a voice means synthesising a sample
 * line, which means a TTS engine this app deliberately does not have — nothing
 * in Kitchen AI speaks except the realtime session itself. A button that
 * silently did nothing would be worse than no button.
 */
export function AssistantPersonaView() {
  const { t } = useLocale();
  const query = useProfile();
  const update = useUpdateProfile();

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const selected: AssistantPersona = query.data.assistantPersona;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('web.assistant.personaTitle')}</CardTitle>
          {update.isSuccess ? (
            <Badge tone="success">{t('web.assistant.personaSaved')}</Badge>
          ) : null}
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.assistant.personaSubtitle')}</p>
        {/* Stated in the product, not only in the spec: a user choosing an
            Egyptian persona should know what they are actually being promised. */}
        <p className="mt-2 text-xs text-muted-foreground">{t('web.assistant.personaHonesty')}</p>
      </Card>

      <div
        className="flex flex-col gap-3"
        role="radiogroup"
        aria-label={t('web.assistant.personaTitle')}
      >
        {assistantPersonaSchema.options.map((persona) => {
          const isSelected = persona === selected;
          return (
            <button
              key={persona}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => update.mutate({ assistantPersona: persona })}
              className={cn(
                'flex flex-col gap-1 rounded-xl border p-4 text-start transition',
                isSelected ? 'border-primary-text bg-primary-soft' : 'border-border hover:bg-muted',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    isSelected ? 'text-primary-text' : 'text-foreground',
                  )}
                >
                  {t(`persona.${persona}`)}
                </span>
                {isSelected ? (
                  <Badge tone="success">{t('web.assistant.personaSelected')}</Badge>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`personaDescription.${persona}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`dialect.${ASSISTANT_PERSONAS[persona].dialect}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
