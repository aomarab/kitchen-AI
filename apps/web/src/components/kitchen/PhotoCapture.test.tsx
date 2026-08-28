import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncodeSource } from '../../lib/image-encode';
import { LocaleProvider } from '../../lib/locale';
import { buildRecognitionSession } from '../../mocks/db';
import { PhotoCapture } from './PhotoCapture';

// The real api.call creates an AbortController in the api-client, but jsdom's
// AbortSignal is not the same class as Node undici's AbortSignal — MSW's fetch
// interceptor rejects it. Mock the api module so the component is tested through
// real React/hook state, while the network layer is a fast stub.
const { call } = vi.hoisted(() => ({
  call: vi.fn<[string, { body?: unknown }?], Promise<unknown>>(),
}));
vi.mock('../../lib/api', () => ({ api: { call } }));

// jsdom implements neither method. Assign the two statics directly — replacing
// the whole `URL` global (e.g. vi.stubGlobal('URL', …)) strips the `new URL()`
// constructor that MSW/fetch rely on to route requests.
let keyCounter = 0;
beforeEach(() => {
  keyCounter = 0;
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock/${n++}`);
  URL.revokeObjectURL = vi.fn();

  // Default implementation: presign returns sequential mock keys, recognize
  // returns the default seeded pantry session.
  call.mockImplementation((route: string, opts?: { body?: unknown }) => {
    if (route === 'presignUpload') {
      const i = keyCounter++;
      // webPhotoUploader.put fetches this URL; use the MSW mock-upload handler.
      return Promise.resolve({
        uploadUrl: `http://localhost:3333/mock-upload/test-${i}`,
        key: `mock/photo-${i}.jpg`,
        headers: {} as Record<string, string>,
        expiresIn: 900,
      });
    }
    if (route === 'recognizePhotos') {
      return Promise.resolve(buildRecognitionSession('pantry'));
    }
    return Promise.resolve(null);
  });
});
afterEach(() => call.mockClear());

const jpeg = () => new Blob(['x'], { type: 'image/jpeg' });
const encodeStub = vi.fn(async (_source: EncodeSource) => jpeg());
afterEach(() => encodeStub.mockClear());

function renderCapture(onItems = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="en">
        <PhotoCapture onItems={onItems} encode={encodeStub} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { onItems };
}

/**
 * Override the mock so we can capture recognize request bodies and control the
 * returned items (e.g. empty list for the nothing-recognised test).
 */
function captureRecognizeBodies(items = buildRecognitionSession('pantry').items) {
  const bodies: { photoKeys: string[]; locationHint?: string }[] = [];
  const baseImpl = call.getMockImplementation()!;
  call.mockImplementation((route: string, opts?: { body?: unknown }) => {
    if (route === 'recognizePhotos') {
      const body = opts?.body as { photoKeys: string[]; locationHint?: string };
      bodies.push(body);
      return Promise.resolve({ ...buildRecognitionSession('pantry'), items });
    }
    return baseImpl(route, opts);
  });
  return bodies;
}

function pickFiles(count: number) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const files = Array.from(
    { length: count },
    (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }),
  );
  fireEvent.change(input, { target: { files } });
}

describe('PhotoCapture', () => {
  it('shows a file input once a location is chosen (camera unavailable in jsdom)', async () => {
    renderCapture();
    fireEvent.click(screen.getByText('Pantry'));
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('caps the thumbnail strip at ten photos', async () => {
    renderCapture();
    fireEvent.click(screen.getByText('Pantry'));
    pickFiles(12);
    const thumbs = await screen.findAllByRole('img', { name: /photo/i });
    expect(thumbs).toHaveLength(10);
  });

  it('runs the upload+recognise pipeline once even if submit is pressed twice', async () => {
    const bodies = captureRecognizeBodies();
    const { onItems } = renderCapture();
    fireEvent.click(screen.getByText('Pantry'));
    pickFiles(1);
    const submit = await screen.findByRole('button', { name: /analyse/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(onItems).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
    const presignCalls = call.mock.calls.filter(([route]) => route === 'presignUpload');
    expect(presignCalls).toHaveLength(1);
  });

  it('recognises the real presigned keys, not the deleted sample photos', async () => {
    const bodies = captureRecognizeBodies();
    const { onItems } = renderCapture();
    fireEvent.click(screen.getByText('Pantry'));
    pickFiles(2);
    await screen.findAllByRole('img', { name: /photo/i });
    fireEvent.click(screen.getByRole('button', { name: /analyse/i }));
    await waitFor(() => expect(onItems).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
    expect(bodies[0].locationHint).toBe('pantry');
    expect(bodies[0].photoKeys).toHaveLength(2);
    for (const key of bodies[0].photoKeys) {
      expect(key).toMatch(/^mock\/.+\.jpg$/);
      expect(key).not.toBe('mock/fridge-1.jpg');
      expect(key).not.toBe('mock/fridge-2.jpg');
    }
    expect(encodeStub).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state when recognition returns no items', async () => {
    captureRecognizeBodies([]);
    const { onItems } = renderCapture();
    fireEvent.click(screen.getByText('Pantry'));
    pickFiles(1);
    await screen.findByRole('button', { name: /analyse/i });
    fireEvent.click(screen.getByRole('button', { name: /analyse/i }));
    expect(await screen.findByText(/couldn't identify/i)).toBeInTheDocument();
    expect(onItems).not.toHaveBeenCalled();
  });
});
