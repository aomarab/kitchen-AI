import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import type { Locale } from '@kitchen/i18n';
import { LocaleProvider } from '../../lib/locale';
import { ErrorState } from './states';

// The server never sends prose — only a machine code + message key. The UI must
// translate that envelope into the active locale (spec §8).
const envelopeError = new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.RATE_LIMITED' });

function renderError(locale: Locale) {
  return render(
    <LocaleProvider locale={locale}>
      <ErrorState error={envelopeError} />
    </LocaleProvider>,
  );
}

describe('ErrorState', () => {
  it('renders the localized English message behind an error envelope', () => {
    renderError('en');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Too many requests. Please wait a moment.')).toBeInTheDocument();
  });

  it('renders the same envelope in Arabic under the Arabic locale', () => {
    renderError('ar');
    expect(screen.getByText('طلبات كثيرة جداً. يرجى الانتظار قليلاً.')).toBeInTheDocument();
    expect(screen.getByText('حدث خطأ ما')).toBeInTheDocument();
  });
});
