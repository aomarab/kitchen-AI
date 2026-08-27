import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLocation } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { SAMPLE_DETECTIONS } from '../../lib/assistant/mock-realtime';
import { MockRealtimeAssistantClient } from '../../lib/assistant/mock-realtime';
import type { RealtimeAssistantClient } from '../../lib/assistant/realtime-port';
import { LiveAssistantView } from './LiveAssistantView';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
const push = vi.fn();

vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const fridge: StorageLocation = {
  id: 'a1111111-1111-4111-8111-111111111111',
  householdId: 'h',
  name: 'Fridge',
  type: 'fridge',
};

/** A real-camera fake: tracks exist and record `stop()`. */
function stubGetUserMedia() {
  const track = { kind: 'video', enabled: true, stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(() => Promise.resolve(stream)) },
  });
}

/** A deterministic realtime client — the injected port the app will ship. */
function fakeClient(): RealtimeAssistantClient {
  return {
    isMock: true,
    start: vi.fn(async ({ onEvent }) => {
      onEvent({ type: 'status', status: 'live' });
      onEvent({ type: 'detections', items: SAMPLE_DETECTIONS });
      onEvent({
        type: 'transcript',
        turn: { id: 'a1', role: 'assistant', text: 'You have tomatoes.' },
      });
    }),
    stop: vi.fn(async () => {}),
  };
}

function renderView(locale: 'en' | 'ar' = 'en') {
  const client = fakeClient();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider locale={locale}>
        <LiveAssistantView createClient={() => client} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  call.mockReset();
  push.mockReset();
  call.mockImplementation((route: string, opts?: { body?: { items?: unknown[] } }) => {
    if (route === 'listLocations') return Promise.resolve([fridge]);
    if (route === 'bulkCreateInventory') {
      return Promise.resolve((opts?.body?.items ?? []).map((_, i) => ({ id: `it-${i}` })));
    }
    // The default transport mints before it can do anything else. `isMock: true`
    // is what a deployment running on mocks returns, and what keeps the view on
    // the scripted client.
    if (route === 'createRealtimeSession') {
      return Promise.resolve({
        clientSecret: 'mock-realtime-secret',
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
        model: 'mock-realtime',
        callsUrl: 'https://example.invalid/realtime/calls',
        isMock: true,
      });
    }
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  // @ts-expect-error — remove the stub between tests.
  delete navigator.mediaDevices;
  vi.restoreAllMocks();
});

describe('LiveAssistantView', () => {
  it('asks for consent first and touches no camera until the user allows it', () => {
    stubGetUserMedia();
    renderView();
    expect(screen.getByText('Cook with a live assistant')).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('goes live after consent, showing the real LIVE and honest DEMO badges', async () => {
    stubGetUserMedia();
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Allow camera & microphone' }));

    await screen.findByTestId('assistant-live');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    // Detections are a labelled sample panel, not bounding boxes on the feed.
    expect(screen.getByText('Spotted (sample)')).toBeInTheDocument();
    expect(screen.getByText('Tomato')).toBeInTheDocument();
  });

  it('writes nothing until the user confirms, then adds via the real ledger path', async () => {
    stubGetUserMedia();
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Allow camera & microphone' }));
    await screen.findByTestId('assistant-live');

    // Detections on screen, but no write has happened yet.
    expect(call).not.toHaveBeenCalledWith('bulkCreateInventory', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Add to inventory' }));
    const addAll = await screen.findByRole('button', { name: 'Add all to kitchen' });
    fireEvent.click(addAll);

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('bulkCreateInventory', expect.anything()),
    );
    // Exactly the three spotted items, into the confirm ledger call.
    const body = call.mock.calls.find((c) => c[0] === 'bulkCreateInventory')?.[1] as {
      body: { items: unknown[] };
    };
    expect(body.body.items).toHaveLength(SAMPLE_DETECTIONS.length);
    expect(await screen.findByRole('status')).toHaveTextContent('Added to your inventory');
  });

  it('renders the consent gate natively in Arabic', () => {
    stubGetUserMedia();
    renderView('ar');
    expect(screen.getByText('اطبخ مع مساعد مباشر')).toBeInTheDocument();
  });

  it('does not loop, and falls back to the scripted client, on the default factory', async () => {
    // Regression: the default `createClient` prop is a new function each render.
    // If it were an effect dependency, going live would restart the session on
    // every render. jsdom resolves the live view before React's update-depth
    // guard trips, so we detect the loop deterministically instead: a healthy
    // session starts the realtime client exactly once.
    const startSpy = vi.spyOn(MockRealtimeAssistantClient.prototype, 'start');
    stubGetUserMedia();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="en">
          <LiveAssistantView />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow camera & microphone' }));
    await screen.findByTestId('assistant-live');
    // Let any runaway re-render loop accumulate before we count.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Exactly one: the default factory mints once, sees `isMock`, and hands to
    // the scripted client. More than one is the re-render loop this guards.
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(call.mock.calls.filter((c) => c[0] === 'createRealtimeSession')).toHaveLength(1);
  });
});
