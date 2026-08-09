'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '../../lib/locale';
import { useLogin } from '../../hooks/auth';
import { Button } from '../ui/Button';
import { Input, Field } from '../ui/Input';
import { ErrorState } from '../ui/states';
import { AuthTabs } from './AuthTabs';
import { OAuthButtons } from './OAuthButtons';

export function SignInForm() {
  const { t } = useLocale();
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState('chef@example.com');
  const [password, setPassword] = useState('Password10');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => router.push('/') });
  };

  return (
    <div className="flex flex-col gap-6">
      <AuthTabs />

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={t('auth.email')} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {login.isError ? <ErrorState error={login.error} /> : null}
        <Button type="submit" block disabled={login.isPending}>
          {t('auth.signIn')}
        </Button>
      </form>

      <OAuthButtons />
    </div>
  );
}
