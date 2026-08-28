import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@kitchen/contracts';
import type { EncodeSource } from '../../lib/image-encode';
import { LocaleProvider } from '../../lib/locale';
import { ReceiptCapture } from './ReceiptCapture';

// The real api.call creates an AbortController in the api-client, but jsdom's
// AbortSignal is not the same class as Node undici's AbortSignal — MSW's fetch
// interceptor rejects it. Mock the api module so the component is tested through
// real React/hook state, while the network layer is a fast stub. The presigned
// upload URL still points at the MSW mock-upload handler, so webPhotoUploader's
// PUT is exercised for real.
const { call } = vi.hoisted(() => ({
  call: vi.fn<(route: string, opts?: { body?: unknown }) => Promise<unknown>>(),
}));
vi.mock('../../lib/api', () => ({ api: { call } }));

const JOB: Job = {
  id: 'job-receipt-1',
  type: 'receipt.parse',
  status: 'queued',
  progress: 0,
  resultRef: null,
  error: null,
  createdAt: new Date().toISOString(),
  finishedAt: null,
};

// jsdom implements neither method. Assign the two statics directly — replacing
// the whole `URL` global strips the `new URL()` constructor MSW/fetch rely on.
beforeEach(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock/${n++}`);
  URL.revokeObjectURL = vi.fn();

  let keyCounter = 0;
  call.mockImplementation((route: string) => {
    if (route === 'presignUpload') {
      const i = keyCounter++;
      return Promise.resolve({
        uploadUrl: `http://localhost:3333/mock-upload/test-${i}`,
        key: `mock/receipt-page-${i}.jpg`,
        headers: {} as Record<string, string>,
        expiresIn: 900,
      });
    }
    if (route === 'parseReceipt') {
      return Promise.resolve(JOB);
    }
    return Promise.resolve(null);
  });
});
afterEach(() => call.mockClear());

const jpeg = () => new Blob(['x'], { type: 'image/jpeg' });
const encodeStub = vi.fn(async (_source: EncodeSource) => jpeg());
afterEach(() => encodeStub.mockClear());

function renderCapture(props: { pending?: boolean; job?: Job | undefined } = {}) {
  const onStart = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="en">
        <ReceiptCapture
          job={props.job}
          onStart={onStart}
          pending={props.pending ?? false}
          encode={encodeStub}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { onStart };
}

/** Capture presign + parseReceipt request bodies while keeping the base impl. */
function captureBodies() {
  const presign: { purpose?: string }[] = [];
  const parse: { photoKeys: string[] }[] = [];
  const base = call.getMockImplementation()!;
  call.mockImplementation((route: string, opts?: { body?: unknown }) => {
    if (route === 'presignUpload') presign.push(opts?.body as { purpose?: string });
    if (route === 'parseReceipt') parse.push(opts?.body as { photoKeys: string[] });
    return base(route, opts);
  });
  return { presign, parse };
}

function pickFiles(count: number) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const files = Array.from(
    { length: count },
    (_, i) => new File(['x'], `r${i}.jpg`, { type: 'image/jpeg' }),
  );
  fireEvent.change(input, { target: { files } });
}

const readButton = () => screen.findByRole('button', { name: /read receipt/i });

describe('ReceiptCapture', () => {
  it('offers a file input for the receipt', () => {
    renderCapture();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('caps the receipt strip at five pages', async () => {
    renderCapture();
    pickFiles(7);
    const thumbs = await screen.findAllByRole('img', { name: /receipt/i });
    expect(thumbs).toHaveLength(5);
  });

  it('sends the real presigned keys, not the mocked sample receipt', async () => {
    const { parse } = captureBodies();
    const { onStart } = renderCapture();
    pickFiles(2);
    await screen.findAllByRole('img', { name: /receipt/i });
    fireEvent.click(await readButton());
    await waitFor(() => expect(onStart).toHaveBeenCalledWith('job-receipt-1'));
    expect(parse).toHaveLength(1);
    expect(parse[0].photoKeys).toHaveLength(2);
    for (const key of parse[0].photoKeys) {
      expect(key).toMatch(/^mock\/receipt-page-\d+\.jpg$/);
      expect(key).not.toBe('mock/receipt-1.jpg');
    }
    expect(encodeStub).toHaveBeenCalledTimes(2);
  });

  it('signs each receipt page for the receipt purpose', async () => {
    const { presign } = captureBodies();
    const { onStart } = renderCapture();
    pickFiles(2);
    await screen.findAllByRole('img', { name: /receipt/i });
    fireEvent.click(await readButton());
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    expect(presign).toHaveLength(2);
    for (const body of presign) expect(body.purpose).toBe('receipt');
  });

  it('starts the parse job once even if read is pressed twice', async () => {
    const { presign, parse } = captureBodies();
    const { onStart } = renderCapture();
    pickFiles(1);
    const button = await readButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    expect(parse).toHaveLength(1);
    expect(presign).toHaveLength(1);
  });

  it('shows the upload error and starts no job when presigning fails', async () => {
    const base = call.getMockImplementation()!;
    call.mockImplementation((route: string, opts?: { body?: unknown }) => {
      // A rejected presign is a raw API/network error, not a PhotoUploadError;
      // the user must still see the upload failure, not a silently reset button.
      if (route === 'presignUpload') return Promise.reject(new Error('network down'));
      return base(route, opts);
    });
    const { onStart } = renderCapture();
    pickFiles(1);
    fireEvent.click(await readButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't be uploaded/i);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('surfaces the parse error when the receipt job cannot be enqueued', async () => {
    // The pages upload fine, but enqueuing the parse fails (e.g. out of credits).
    // The HTTP call rejects, so no job id is ever handed up to poll — the error
    // must be shown here rather than trapping the user at a reset form.
    const base = call.getMockImplementation()!;
    call.mockImplementation((route: string, opts?: { body?: unknown }) => {
      if (route === 'parseReceipt') return Promise.reject(new Error('enqueue failed'));
      return base(route, opts);
    });
    const { onStart } = renderCapture();
    pickFiles(1);
    fireEvent.click(await readButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('shows the parsing state while the job is pending', () => {
    renderCapture({ pending: true });
    expect(screen.getByText(/reading your receipt/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /read receipt/i })).toBeNull();
  });
});
