import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLocation } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { SAMPLE_DETECTIONS } from '../../lib/assistant/mock-realtime';
import { MockRealtimeAssistantClient } from '../../lib/assistant/mock-realtime';
import type { RealtimeAssistantClient, AssistantEvent } from '../../lib/assistant/realtime-port';
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
    sendText: vi.fn(),
  };
}

/**
 * A client the test drives beat by beat, for the states that only exist
 * mid-session (the assistant speaking, then stopping).
 */
function controllableClient() {
  let emit: ((event: AssistantEvent) => void) | null = null;
  const sendText = vi.fn();
  const client: RealtimeAssistantClient = {
    isMock: true,
    start: vi.fn(async ({ onEvent }) => {
      emit = onEvent;
      onEvent({ type: 'status', status: 'live' });
    }),
    stop: vi.fn(async () => {}),
    sendText,
  };
  return {
    client,
    sendText,
    emit(event: AssistantEvent) {
      act(() => emit?.(event));
    },
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
    expect(screen.getByTestId('assistant-live-badge')).toHaveTextContent('Live');
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
    // Assert the payload, not just its length. The ledger is append-only, so
    // whatever lands here is permanent: a dropped name, a wrong quantity or a
    // fictional provenance can never be corrected, only annotated. A
    // `toHaveLength` check passes on three rows of garbage — and did, while
    // this path wrote every assistant item as `source: 'photo'`.
    const body = call.mock.calls.find((c) => c[0] === 'bulkCreateInventory')?.[1] as {
      body: { items: Array<Record<string, unknown>> };
    };
    expect(body.body.items).toHaveLength(SAMPLE_DETECTIONS.length);
    expect(
      body.body.items.map((item) => ({
        rawName: item.rawName,
        rawNameAr: item.rawNameAr,
        rawCategory: item.rawCategory,
        quantity: item.quantity,
        unit: item.unit,
        source: item.source,
      })),
    ).toEqual(
      SAMPLE_DETECTIONS.map((detection) => ({
        rawName: detection.nameEn,
        // Both names and the category travel: `ingredients` is a global table,
        // so dropping them files every assistant item under one language and
        // "other" for every household, not just this one.
        rawNameAr: detection.nameAr,
        rawCategory: detection.category,
        quantity: detection.quantity,
        unit: detection.unit,
        // Nobody photographed anything. `photo` here would be a lie the ledger
        // keeps forever.
        source: 'assistant',
      })),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Added to your inventory');
  });

  it('renders the consent gate natively in Arabic', () => {
    stubGetUserMedia();
    renderView('ar');
    expect(screen.getByText('اطبخ مع مساعد مباشر')).toBeInTheDocument();
  });

  it('shows the speaking state only while the transport says the voice is playing', async () => {
    stubGetUserMedia();
    const { client, emit } = controllableClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="en">
          <LiveAssistantView createClient={() => client} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow camera & microphone' }));
    await screen.findByTestId('assistant-live');

    // A live session is not a speaking one.
    expect(screen.queryByTestId('assistant-speaking')).toBeNull();

    emit({ type: 'speaking', speaking: true });
    expect(screen.getByTestId('assistant-speaking')).toHaveTextContent('Speaking now');

    emit({ type: 'speaking', speaking: false });
    expect(screen.queryByTestId('assistant-speaking')).toBeNull();
  });

  it('does not leave the speaking state lit when the session ends mid-sentence', async () => {
    stubGetUserMedia();
    const { client, emit } = controllableClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="en">
          <LiveAssistantView createClient={() => client} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow camera & microphone' }));
    await screen.findByTestId('assistant-live');

    emit({ type: 'speaking', speaking: true });
    expect(screen.getByTestId('assistant-speaking')).toBeInTheDocument();

    // A dropped connection is not obliged to send a closing `speaking: false`,
    // so the view refuses to keep claiming speech after the session is over.
    emit({ type: 'status', status: 'ended' });
    expect(screen.queryByTestId('assistant-speaking')).toBeNull();
  });

  it('names the speaking state in Arabic', async () => {
    stubGetUserMedia();
    const { client, emit } = controllableClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="ar">
          <LiveAssistantView createClient={() => client} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'اسمح بالكاميرا والميكروفون' }));
    await screen.findByTestId('assistant-live');

    emit({ type: 'speaking', speaking: true });
    expect(screen.getByTestId('assistant-speaking')).toHaveTextContent('يتحدث الآن');
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

  it('text mode sends the typed message through the port and never opens a device', async () => {
    stubGetUserMedia();
    const client = fakeClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="en">
          <LiveAssistantView createClient={() => client} initialMode="text" />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    // Text is never gated: the conversation is up with no consent card, and no
    // camera or microphone is ever touched.
    await screen.findByTestId('assistant-live');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    // A typed chat is not "Live" — the red badge stays off.
    expect(screen.queryByTestId('assistant-live-badge')).toBeNull();

    const input = screen.getByLabelText('Message the assistant…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'what can I cook?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // The message goes out over the transport, and the composer clears.
    expect(client.sendText).toHaveBeenCalledWith('what can I cook?');
    expect(input.value).toBe('');
  });

  it('does not send blank messages', async () => {
    stubGetUserMedia();
    const client = fakeClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="en">
          <LiveAssistantView createClient={() => client} initialMode="text" />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await screen.findByTestId('assistant-live');

    // An empty composer disables the send control; whitespace never ships.
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    const input = screen.getByLabelText('Message the assistant…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(send);
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('switching to Voice asks only for the microphone, never the camera', async () => {
    stubGetUserMedia();
    const client = fakeClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="en">
          <LiveAssistantView createClient={() => client} initialMode="text" />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await screen.findByTestId('assistant-live');

    fireEvent.click(screen.getByRole('tab', { name: 'Voice' }));

    // Voice needs a mic it does not yet hold, so it shows the mic gate — not the
    // camera consent card — and touches no device until the user allows it.
    expect(screen.getByText('Talk with the assistant')).toBeInTheDocument();
    expect(screen.queryByText('Cook with a live assistant')).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await screen.findByTestId('assistant-live');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    // Mic-only: the request never asks for video.
    const constraints = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(constraints.video).toBe(false);
  });

  it('locks the mode when asked, hiding the switcher (cook-along voice)', async () => {
    stubGetUserMedia();
    const client = fakeClient();
    const onExit = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider locale="en">
          <LiveAssistantView
            createClient={() => client}
            initialMode="voice"
            lockMode
            onExit={onExit}
          />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    // A locked voice session opens straight on the mic gate with no mode tabs.
    expect(screen.queryByRole('tab', { name: 'Text' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Type instead' })).toBeNull();
    expect(screen.getByText('Talk with the assistant')).toBeInTheDocument();
  });
});
