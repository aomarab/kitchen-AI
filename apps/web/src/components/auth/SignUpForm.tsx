'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import { useRegister } from '../../hooks/auth';
import { Button } from '../ui/Button';
import { Input, Field } from '../ui/Input';
import { ErrorState } from '../ui/states';
import { OAuthButtons } from './OAuthButtons';

export function SignUpForm() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate(
      { displayName, email, password, locale },
      { onSuccess: () => router.push('/setup') },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('web.auth.signUpTitle')}</h1>
        <p className="text-muted-foreground">{t('web.auth.signUpSubtitle')}</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={t('auth.displayName')} htmlFor="name">
          <Input id="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label={t('auth.email')} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('web.auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <span className="text-xs text-muted-foreground">{t('auth.passwordRules.tooShort')}</span>
        </Field>
        {register.isError ? <ErrorState error={register.error} /> : null}
        <Button type="submit" block disabled={register.isPending}>
          {t('auth.signUp')}
        </Button>
      </form>

      <OAuthButtons />

      <p className="text-center text-sm text-muted-foreground">
        {t('web.auth.haveAccount')}{' '}
        <Link href="/sign-in" className="font-medium text-primary underline-offset-2 hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
