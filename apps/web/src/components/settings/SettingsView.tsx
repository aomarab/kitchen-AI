'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  cuisineSchema,
  dietaryPreferenceSchema,
  healthGoalSchema,
  type Cuisine,
  type DietaryPreference,
  type HealthGoal,
  type UpdateProfileRequest,
} from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { cuisineKey, dietKey, healthGoalKey } from '../../lib/labels';
import { cn } from '../../lib/cn';
import { useProfile, useUpdateProfile } from '../../hooks/settings';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button, buttonClasses } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input, Field } from '../ui/Input';
import { LocaleToggle } from '../shell/LocaleToggle';
import { LoadingState, ErrorState } from '../ui/states';
import { CloseIcon } from '../ui/icons';

const DIETS = dietaryPreferenceSchema.options;
const CUISINES = cuisineSchema.options;
const HEALTH_GOALS = healthGoalSchema.options;

export function SettingsView() {
  const { t, locale } = useLocale();
  const profileQuery = useProfile();
  const update = useUpdateProfile();
  const [allergyDraft, setAllergyDraft] = useState('');

  if (profileQuery.isLoading) return <LoadingState />;
  if (profileQuery.isError) return <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />;
  if (!profileQuery.data) return null;

  const profile = profileQuery.data;
  const save = (patch: UpdateProfileRequest) => update.mutate(patch);

  const toggleDiet = (d: DietaryPreference) =>
    save({
      dietaryPrefs: profile.dietaryPrefs.includes(d)
        ? profile.dietaryPrefs.filter((x) => x !== d)
        : [...profile.dietaryPrefs, d],
    });

  const toggleCuisine = (c: Cuisine) =>
    save({
      cuisinePrefs: profile.cuisinePrefs.includes(c)
        ? profile.cuisinePrefs.filter((x) => x !== c)
        : [...profile.cuisinePrefs, c],
    });

  const toggleHealthGoal = (g: HealthGoal) =>
    save({
      healthGoals: profile.healthGoals.includes(g)
        ? profile.healthGoals.filter((x) => x !== g)
        : [...profile.healthGoals, g],
    });

  const addAllergy = () => {
    const value = allergyDraft.trim();
    if (!value || profile.allergies.includes(value)) return;
    save({ allergies: [...profile.allergies, value] });
    setAllergyDraft('');
  };

  const removeAllergy = (value: string) =>
    save({ allergies: profile.allergies.filter((a) => a !== value) });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('web.settings.appearanceTitle')}</CardTitle>
          {update.isSuccess ? <Badge tone="success">{t('web.settings.saved')}</Badge> : null}
        </CardHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('web.settings.localeLabel')}</span>
          <LocaleToggle />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('profile.dietary')}</h3>
            <div className="flex flex-wrap gap-2">
              {DIETS.map((d) => (
                <Chip key={d} active={profile.dietaryPrefs.includes(d)} onClick={() => toggleDiet(d)}>
                  {t(dietKey(d))}
                </Chip>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('profile.cuisines')}</h3>
            <div className="flex flex-wrap gap-2">
              {CUISINES.map((c) => (
                <Chip key={c} active={profile.cuisinePrefs.includes(c)} onClick={() => toggleCuisine(c)}>
                  {t(cuisineKey(c))}
                </Chip>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('profile.healthGoals')}</h3>
            <div className="flex flex-wrap gap-2">
              {HEALTH_GOALS.map((g) => (
                <Chip key={g} active={profile.healthGoals.includes(g)} onClick={() => toggleHealthGoal(g)}>
                  {t(healthGoalKey(g))}
                </Chip>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('profile.allergies')}</h3>
            <p className="text-xs text-muted-foreground">{t('profile.allergiesHint')}</p>
            <div className="flex flex-wrap gap-2">
              {profile.allergies.map((a) => (
                <span key={a} className="flex items-center gap-1 rounded-full border border-danger bg-danger-soft px-3 py-1 text-sm text-danger">
                  {a}
                  <button type="button" aria-label={t('common.delete')} onClick={() => removeAllergy(a)}>
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={allergyDraft}
                onChange={(e) => setAllergyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAllergy();
                  }
                }}
                placeholder={t('web.settings.allergyPlaceholder')}
              />
              <Button variant="outline" onClick={addAllergy} disabled={allergyDraft.trim().length === 0}>
                {t('common.add')}
              </Button>
            </div>
          </section>

          <section className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{t('profile.halal')}</h3>
            </div>
            <input
              type="checkbox"
              checked={profile.halal}
              onChange={(e) => save({ halal: e.target.checked })}
              aria-label={t('profile.halal')}
              className="h-5 w-5 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
          </section>

          <section className="flex flex-col gap-2">
            <Field label={t('profile.householdSize')} htmlFor="household-size">
              <Input
                id="household-size"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                defaultValue={formatNumber(locale, profile.householdSize)}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (next >= 1 && next <= 20 && next !== profile.householdSize) save({ householdSize: next });
                }}
                className="w-32"
              />
            </Field>
          </section>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('web.reminders.entry')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.reminders.entryHint')}</p>
        <Link href="/settings/reminders" className={buttonClasses({ className: 'mt-4' })}>
          {t('web.reminders.title')}
        </Link>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('web.screen.entry')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.screen.entryHint')}</p>
        <Link href="/screen" className={buttonClasses({ className: 'mt-4' })}>
          {t('web.screen.open')}
        </Link>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('web.feedback.entry')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.feedback.entryHint')}</p>
        <Link href="/settings/feedback" className={buttonClasses({ className: 'mt-4' })}>
          {t('web.feedback.title')}
        </Link>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('web.deleteAccount.title')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.deleteAccount.intro')}</p>
        <Link
          href="/settings/delete-account"
          className="mt-4 inline-flex w-fit items-center text-sm font-semibold text-danger hover:underline"
        >
          {t('web.deleteAccount.link')}
        </Link>
      </Card>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium transition',
        active ? 'border-primary-text bg-primary-soft text-primary-text' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
