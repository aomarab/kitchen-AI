import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as CsvModule from '../../lib/csv';
import { LocaleProvider } from '../../lib/locale';
import { VendorExportButton } from './VendorExportButton';

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
    rating: 2,
    message,
    locale: 'en',
    createdAt: '2026-08-01T10:00:00.000Z',
    nameEn: 'Milk',
    nameAr: 'حليب',
    brand: 'Almarai',
  };
}

function renderButton(filters = {}) {
  return render(
    <LocaleProvider locale="en">
      <VendorExportButton filters={filters} />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  call.mockReset();
  downloaded.length = 0;
});

describe('VendorExportButton', () => {
  it('exports every page, not only the first', async () => {
    // A truncated export looks exactly like a successful one, so the vendor
    // would act on a partial picture without ever knowing rows were missing.
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

  it('never puts the customer in the vendor file', async () => {
    // The API does not return an identity today. If that ever changes, this
    // file is where it would silently start reaching the company that was
    // criticised, so assert on the header row rather than on the API.
    call.mockResolvedValueOnce({
      items: [{ ...row('a', 'soured early'), submitter: { email: 'chef@example.com' } }],
      nextCursor: null,
    });

    renderButton();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(downloaded).toHaveLength(1));
    expect(downloaded[0]!.body).not.toContain('chef@example.com');
    // The leading BOM is deliberate — Excel needs it to read the Arabic
    // column — so strip it rather than asserting it away.
    const header = downloaded[0]!.body.replace(/^\ufeff/, '').split(/\r?\n/)[0];
    expect(header).toBe('created_at,brand,product_en,product_ar,rating,locale,comment');
  });

  it('names the file after the vendor being sent it', async () => {
    call.mockResolvedValue({ items: [row('a', 'soured early')], nextCursor: null });

    renderButton({ brand: 'Al Marai' });
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(downloaded).toHaveLength(1));
    expect(downloaded[0]!.name).toMatch(/^product-reviews-al-marai-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('says so when the export fails instead of downloading nothing', async () => {
    call.mockRejectedValueOnce(new Error('offline'));

    renderButton();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(downloaded).toHaveLength(0);
  });
});
