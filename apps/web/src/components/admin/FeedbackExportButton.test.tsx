import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as CsvModule from '../../lib/csv';
import { LocaleProvider } from '../../lib/locale';
import { FeedbackExportButton } from './FeedbackExportButton';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { call } }));

const downloaded: { name: string; body: string }[] = [];
vi.mock('../../lib/csv', async (importOriginal) => {
  const actual = await importOriginal<typeof CsvModule>();
  return {
    ...actual,
    downloadCsv: (name: string, body: string) => downloaded.push({ name, body }),
  };
});

function row(id: string, message: string) {
  return {
    id,
    rating: 4,
    message,
    platform: 'ios',
    appVersion: '1.0.0',
    locale: 'en',
    status: 'new',
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

function renderButton(filters = {}) {
  return render(
    <LocaleProvider locale="en">
      <FeedbackExportButton filters={filters} />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  call.mockReset();
  downloaded.length = 0;
});

describe('FeedbackExportButton', () => {
  it('exports every page, not only the first', async () => {
    // The failure this guards against looks like success: a truncated file.
    call
      .mockResolvedValueOnce({ items: [row('a', 'first')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [row('b', 'second')], nextCursor: null });

    renderButton();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(downloaded).toHaveLength(1));
    expect(call).toHaveBeenCalledTimes(2);
    expect(downloaded[0]!.body).toContain('first');
    expect(downloaded[0]!.body).toContain('second');
  });

  it('passes the active filters, so it exports what the screen shows', async () => {
    call.mockResolvedValue({ items: [], nextCursor: null });

    renderButton({ status: 'new', rating: 5 });
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(call).toHaveBeenCalled());
    expect(call.mock.calls[0]![1].query).toMatchObject({ status: 'new', rating: 5 });
  });

  it('says so when the export fails instead of appearing to do nothing', async () => {
    call.mockRejectedValue(new Error('network'));

    renderButton();
    fireEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(downloaded).toHaveLength(0);
  });
});
