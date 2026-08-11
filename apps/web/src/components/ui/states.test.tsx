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

// A 402 is not a breakage but an out-of-credits state (spec §7): the UI names it
// as such and routes the user to top up rather than offering a bare retry.
const outOfCreditsError = new ApiError(402, {
  code: 'INSUFFICIENT_CREDITS',
  messageKey: 'errors.INSUFFICIENT_CREDITS',
});

describe('ErrorState — out of credits', () => {
  it('titles a 402 as out of credits and links to top up instead of retrying', () => {
    const retry = () => {};
    render(
      <LocaleProvider locale="en">
        <ErrorState error={outOfCreditsError} onRetry={retry} />
      </LocaleProvider>,
    );

    // The out-of-credits title, not the generic error title.
    expect(screen.getByText('Out of credits')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();

    // The translated envelope message is shown, never the raw key.
    expect(
      screen.getByText("You don't have enough credits for this. Top up to keep cooking."),
    ).toBeInTheDocument();

    // A route to buy more, and no retry — retrying without credits can't succeed.
    const link = screen.getByRole('link', { name: 'Get more credits' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('renders the out-of-credits route from a plain {code} envelope too', () => {
    render(
      <LocaleProvider locale="en">
        <ErrorState
          error={{ code: 'INSUFFICIENT_CREDITS', messageKey: 'errors.INSUFFICIENT_CREDITS' }}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole('link', { name: 'Get more credits' })).toBeInTheDocument();
  });

  it('keeps the retry affordance for ordinary errors', () => {
    render(
      <LocaleProvider locale="en">
        <ErrorState error={envelopeError} onRetry={() => {}} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get more credits' })).not.toBeInTheDocument();
    expect(screen.queryByText('Out of credits')).not.toBeInTheDocument();
  });
});
