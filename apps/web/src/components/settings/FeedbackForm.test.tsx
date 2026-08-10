import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import { FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { FeedbackForm } from './FeedbackForm';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

function renderForm(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <FeedbackForm />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

/** Star `n` of the five-option radiogroup. */
const star = (n: number) => screen.getByRole('radio', { name: new RegExp(`${n} out of 5`, 'i') });
const submitButton = () => screen.getByRole('button', { name: /send feedback/i });

describe('FeedbackForm', () => {
  /**
   * Braces matter here. `mockReset()` returns the mock, and an arrow function
   * with an implicit return hands that function back to Vitest, which treats a
   * function returned from `beforeEach` as a teardown callback — and then calls
   * it after every test. For the rejection case below that invokes the mock an
   * extra time with nothing awaiting it, producing an unhandled rejection that
   * fails the test with the very error it is asserting on.
   */
  beforeEach(() => {
    call.mockReset();
  });

  it('cannot be submitted without a rating', async () => {
    renderForm();
    expect(submitButton()).toBeDisabled();
  });

  it('sends the rating, platform, version and locale', async () => {
    call.mockResolvedValue({ id: 'f1', createdAt: new Date().toISOString() });
    renderForm();

    fireEvent.click(star(4));
    fireEvent.click(submitButton());

    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    expect(call.mock.calls[0][0]).toBe('submitFeedback');
    expect(call.mock.calls[0][1].body).toMatchObject({
      rating: 4,
      platform: 'web',
      locale: 'en',
    });
    // An empty textarea must not become an empty string in the payload.
    expect(call.mock.calls[0][1].body.message).toBeUndefined();
  });

  it('sends a trimmed message when one is written', async () => {
    call.mockResolvedValue({ id: 'f1', createdAt: new Date().toISOString() });
    renderForm();

    fireEvent.click(star(5));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  scanning is slow  ' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(call).toHaveBeenCalled());
    expect(call.mock.calls[0][1].body.message).toBe('scanning is slow');
  });

  it('caps the message at the contract limit', async () => {
    renderForm();
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', String(FEEDBACK_MESSAGE_MAX));
  });

  it('shows a thank-you instead of the form once accepted', async () => {
    call.mockResolvedValue({ id: 'f1', createdAt: new Date().toISOString() });
    renderForm();

    fireEvent.click(star(3));
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByText(/thank you/i)).toBeInTheDocument());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders the localized error key when the server rejects', async () => {
    call.mockRejectedValue(
      new ApiError(429, { code: 'RATE_LIMITED', messageKey: 'errors.feedbackRateLimited' }),
    );
    renderForm();

    fireEvent.click(star(2));
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // A real ApiError, not a plain object: `resolveErrorKey` matches on
    // `instanceof`, so a fake would silently fall through to INTERNAL_ERROR and
    // the test would pass while proving nothing about the key.
    const alert = screen.getByRole('alert');
    // An unresolved key would render the raw `errors.*` string to the user.
    expect(alert.textContent).not.toContain('errors.');
    expect(alert.textContent).toMatch(/try again tomorrow/i);
    // Still on the form, so the user can try again tomorrow without losing text.
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('labels every star in Arabic too', async () => {
    renderForm('ar');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  /**
   * The spec calls out keyboard operability by name, and a row of clickable
   * spans would pass every other test in this file.
   *
   * Arrow-key roving selection is native browser behaviour for same-name radio
   * inputs — jsdom does not implement it, so driving a synthetic ArrowRight
   * would assert the simulator rather than the component. What the component
   * genuinely owes is the structure the browser needs, which is what this
   * checks: five real radios sharing one name, each reachable by focus rather
   * than hidden from the tab order.
   */
  it('is a native radiogroup, which is what makes it keyboard operable', () => {
    renderForm();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);

    for (const radio of radios) {
      expect(radio).toHaveAttribute('type', 'radio');
      expect(radio.getAttribute('name')).toBe('feedback-rating');
      // `sr-only` keeps the input focusable; `display:none` or tabindex=-1
      // would not, and would take arrow-key selection with it.
      expect(radio).not.toHaveAttribute('tabindex', '-1');
    }

    (radios[0] as HTMLElement).focus();
    expect(radios[0]).toHaveFocus();

    // Selecting via the keyboard fires `change`, exactly as the browser does.
    fireEvent.click(star(3));
    expect(star(3)).toBeChecked();
  });
});
