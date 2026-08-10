import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeedbackDetail as Detail } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { FeedbackDetail } from './FeedbackDetail';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const DETAIL: Detail = {
  id: 'f1',
  rating: 2,
  message: 'The barcode scanner misses most local products.',
  platform: 'ios',
  appVersion: '1.2.3',
  locale: 'en',
  status: 'new',
  createdAt: '2026-08-01T10:00:00.000Z',
  adminNote: null,
  reviewedAt: null,
  submitter: {
    id: 'u1',
    email: 'person@example.com',
    displayName: 'Person',
    locale: 'en',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
};

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="en">
        <FeedbackDetail id="f1" />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('FeedbackDetail', () => {
  // Block body, NOT `() => call.mockReset()`. mockReset() returns the mock, and a
  // function returned from beforeEach is registered by Vitest as a teardown
  // callback and then CALLED after every test — invoking the mock again with
  // nothing awaiting it. For any test whose mock rejects, that surfaces as an
  // unhandled rejection and fails the test with the very error it asserts on.
  beforeEach(() => {
    call.mockReset();
  });

  it('shows the message, the context line and the submitter', async () => {
    call.mockResolvedValue(DETAIL);
    renderDetail();

    await waitFor(() => expect(screen.getByText(DETAIL.message!)).toBeInTheDocument());
    expect(screen.getByText(/person@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument();
  });

  it('saves a status change and an internal note together', async () => {
    call.mockImplementation((name: string) =>
      name === 'adminGetFeedback'
        ? Promise.resolve(DETAIL)
        : Promise.resolve({ ...DETAIL, status: 'resolved', adminNote: 'Fixed in 1.3.0.' }),
    );
    // fireEvent, not user-event: @testing-library/user-event is NOT a declared
    // dependency of @kitchen/web, so CI (--frozen-lockfile) would not install it.
    renderDetail();

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'resolved' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fixed in 1.3.0.' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('adminUpdateFeedback', {
        params: { id: 'f1' },
        body: { status: 'resolved', adminNote: 'Fixed in 1.3.0.' },
      }),
    );
  });

  it('renders a rating-only submission without pretending there is a message', async () => {
    call.mockResolvedValue({ ...DETAIL, message: null });
    renderDetail();

    await waitFor(() => expect(screen.getByText(/rating only/i)).toBeInTheDocument());
  });

  it('never renders a reply control — there is no reply channel', async () => {
    call.mockResolvedValue(DETAIL);
    renderDetail();

    await waitFor(() => expect(screen.getByText(DETAIL.message!)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /reply/i })).not.toBeInTheDocument();
  });

  it('does not overwrite an untouched note when only the status changes', async () => {
    call.mockImplementation((name: string) =>
      name === 'adminGetFeedback'
        ? Promise.resolve(DETAIL)
        : Promise.resolve({ ...DETAIL, status: 'triaged' }),
    );
    renderDetail();

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'triaged' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // The API writes any key that is not `undefined`, so an untouched note must
    // be absent from the body — sending '' would clobber a null note.
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('adminUpdateFeedback', {
        params: { id: 'f1' },
        body: { status: 'triaged' },
      }),
    );
  });

  it('clears a note back to null rather than to an empty string', async () => {
    const withNote = { ...DETAIL, adminNote: 'Old note.' };
    call.mockImplementation((name: string) =>
      name === 'adminGetFeedback'
        ? Promise.resolve(withNote)
        : Promise.resolve({ ...withNote, adminNote: null }),
    );
    renderDetail();

    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Old note.'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('adminUpdateFeedback', {
        params: { id: 'f1' },
        body: { adminNote: null },
      }),
    );
  });

  /**
   * The console renders in the *reader's* direction, but feedback is written in
   * whatever language the author chose. Without `dir="auto"` an English message
   * read in the Arabic console has its full stop thrown to the left-hand end,
   * and a mixed-script message reorders. The browser resolves this from the
   * first strong character, so the only thing to guard is that we ask it to.
   */
  it('lets each message resolve its own direction', async () => {
    call.mockResolvedValue(DETAIL);
    renderDetail();

    const message = await screen.findByText(DETAIL.message!);
    expect(message).toHaveAttribute('dir', 'auto');
    expect(screen.getByRole('textbox')).toHaveAttribute('dir', 'auto');
  });
});
