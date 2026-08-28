import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarcodeLookupResponse, RecognizedItem } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { BarcodeCapture, type BarcodeScanner } from './BarcodeCapture';

// See ReceiptCapture.test: jsdom's AbortSignal breaks MSW, so the network layer
// is a fast stub while the component runs through real React/hook state.
const { call } = vi.hoisted(() => ({
  call: vi.fn<(route: string, opts?: { query?: { barcode?: string } }) => Promise<unknown>>(),
}));
vi.mock('../../lib/api', () => ({ api: { call } }));

const foundResponse = (): BarcodeLookupResponse => ({
  found: true,
  productName: 'Canned Chickpeas',
  productNameAr: 'حمص معلب',
  brand: null,
  imageUrl: null,
  match: {
    ingredientId: '00000000-0000-0000-0000-000000000001',
    strategy: 'exact',
    confidence: 0.92,
    rawName: 'chickpeas',
  },
  // A real category distinct from the old hardcoded 'canned', so the row must
  // carry it through rather than inventing one.
  category: 'legume',
  suggestedQuantity: 2,
  suggestedUnit: 'can',
});

const notFoundResponse = (): BarcodeLookupResponse => ({
  found: false,
  productName: null,
  productNameAr: null,
  brand: null,
  imageUrl: null,
  // A match object present alongside `found: false` proves the component keys
  // off `found`, not merely off a null match.
  match: {
    ingredientId: '00000000-0000-0000-0000-000000000002',
    strategy: 'unresolved',
    confidence: 0,
    rawName: 'unknown',
  },
  category: null,
  suggestedQuantity: null,
  suggestedUnit: null,
});

beforeEach(() => {
  call.mockImplementation((route: string) =>
    Promise.resolve(route === 'lookupBarcode' ? foundResponse() : null),
  );
});
afterEach(() => call.mockClear());

/** Record every barcode value handed to the lookup route. */
function barcodeQueries() {
  const codes: string[] = [];
  const base = call.getMockImplementation()!;
  call.mockImplementation((route: string, opts?: { query?: { barcode?: string } }) => {
    if (route === 'lookupBarcode' && opts?.query?.barcode) codes.push(opts.query.barcode);
    return base(route, opts);
  });
  return codes;
}

function renderCapture(createScanner?: () => BarcodeScanner | null) {
  const onItems = vi.fn<(items: RecognizedItem[]) => void>();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="en">
        <BarcodeCapture onItems={onItems} createScanner={createScanner} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { onItems };
}

const noScanner = () => null;
const typeCode = (value: string) =>
  fireEvent.change(document.querySelector('#barcode') as HTMLInputElement, { target: { value } });
const lookupButton = () => screen.getByRole('button', { name: /look up/i });

/** Drive the camera hook to `ready` so the scan loop runs. Returns a cleanup. */
function stubCamera() {
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  });
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(() => Promise.resolve(stream)) },
  });
  return () => {
    // @ts-expect-error - remove the stub between tests
    delete navigator.mediaDevices;
  };
}

describe('BarcodeCapture', () => {
  it('shows only the typed field when the browser has no barcode detector', () => {
    renderCapture(noScanner);
    expect(document.querySelector('#barcode')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /scan with camera/i })).toBeNull();
  });

  it('looks up a typed barcode and adds the matched item', async () => {
    const codes = barcodeQueries();
    const { onItems } = renderCapture(noScanner);
    typeCode('0123456');
    fireEvent.click(lookupButton());
    await waitFor(() => expect(onItems).toHaveBeenCalledTimes(1));
    expect(codes).toEqual(['0123456']);
    const row = onItems.mock.calls[0][0][0];
    expect(row.match?.rawName).toBe('chickpeas');
    expect(row.nameEn).toBe('Canned Chickpeas');
    expect(row.quantity).toBe(2);
    expect(row.unit).toBe('can');
  });

  it('carries the Arabic name and real category onto the row', async () => {
    const { onItems } = renderCapture(noScanner);
    typeCode('0123456');
    fireEvent.click(lookupButton());
    await waitFor(() => expect(onItems).toHaveBeenCalledTimes(1));
    const row = onItems.mock.calls[0][0][0];
    expect(row.nameAr).toBe('حمص معلب');
    expect(row.category).toBe('legume');
  });

  it('shows the not-found badge and adds nothing for an unknown barcode', async () => {
    call.mockImplementation((route: string) =>
      Promise.resolve(route === 'lookupBarcode' ? notFoundResponse() : null),
    );
    const { onItems } = renderCapture(noScanner);
    typeCode('9999999');
    fireEvent.click(lookupButton());
    expect(await screen.findByText(/isn't in the product database/i)).toBeInTheDocument();
    expect(onItems).not.toHaveBeenCalled();
  });

  it('rejects a typed code that is not six-to-twenty digits, without rewriting it', () => {
    const codes = barcodeQueries();
    renderCapture(noScanner);
    typeCode('123');
    expect(lookupButton()).toBeDisabled();
    // Letters are rejected outright, never stripped down to a numeric substring.
    typeCode('ABC123456');
    expect(lookupButton()).toBeDisabled();
    fireEvent.click(lookupButton());
    expect(codes).toHaveLength(0);
  });

  it('scans a barcode from the camera and looks up that exact code', async () => {
    const restore = stubCamera();
    const detect = vi.fn(async () => [{ rawValue: '5901234123457' }]);
    const codes = barcodeQueries();
    try {
      const { onItems } = renderCapture(() => ({ detect }));
      fireEvent.click(screen.getByRole('button', { name: /scan with camera/i }));
      await waitFor(() => expect(onItems).toHaveBeenCalledTimes(1));
      expect(detect).toHaveBeenCalled();
      expect(codes).toEqual(['5901234123457']);
      expect(onItems.mock.calls[0][0][0].nameEn).toBe('Canned Chickpeas');
    } finally {
      restore();
    }
  });

  it('ignores a non-numeric scan and never looks it up', async () => {
    const restore = stubCamera();
    const detect = vi.fn(async () => [{ rawValue: 'ABC-DEF' }]);
    const codes = barcodeQueries();
    try {
      renderCapture(() => ({ detect }));
      fireEvent.click(screen.getByRole('button', { name: /scan with camera/i }));
      // Wait for the loop to have decoded at least twice, proving it ran and
      // rejected the value rather than simply never reaching the frame.
      await waitFor(() => expect(detect.mock.calls.length).toBeGreaterThanOrEqual(2));
      expect(codes).toHaveLength(0);
    } finally {
      restore();
    }
  });

  it('stops scanning after a result instead of auto-submitting the next code', async () => {
    call.mockImplementation((route: string) =>
      Promise.resolve(route === 'lookupBarcode' ? notFoundResponse() : null),
    );
    const restore = stubCamera();
    const values = ['11111111', '22222222'];
    let i = 0;
    const detect = vi.fn(async () => [{ rawValue: values[Math.min(i++, values.length - 1)] }]);
    const codes = barcodeQueries();
    try {
      renderCapture(() => ({ detect }));
      fireEvent.click(screen.getByRole('button', { name: /scan with camera/i }));
      // The first code is looked up; once it settles the scanner halts, so the
      // second code the camera keeps decoding is never sent.
      await waitFor(() => expect(codes).toEqual(['11111111']));
      await waitFor(() => expect(detect.mock.calls.length).toBeGreaterThanOrEqual(3));
      expect(codes).toEqual(['11111111']);
    } finally {
      restore();
    }
  });
});
