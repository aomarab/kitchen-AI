import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ASSISTANT_PERSONAS,
  DEFAULT_ASSISTANT_PERSONA,
  assistantPersonaSchema,
} from '@kitchen/contracts';
import { ar, en } from '@kitchen/i18n';
import { LocaleProvider } from '../../lib/locale';
import { AssistantPersonaView } from './AssistantPersonaView';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const profile = {
  userId: '11111111-1111-4111-8111-111111111111',
  dietaryPrefs: [],
  allergies: [],
  halal: false,
  cuisinePrefs: [],
  householdSize: 2,
  healthGoals: [],
  assistantPersona: DEFAULT_ASSISTANT_PERSONA,
};

function renderView(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <AssistantPersonaView />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('AssistantPersonaView', () => {
  beforeEach(() => {
    call.mockReset();
    call.mockImplementation((route: string, args?: { body?: Record<string, unknown> }) => {
      if (route === 'getProfile') return Promise.resolve(profile);
      if (route === 'updateProfile') return Promise.resolve({ ...profile, ...args?.body });
      throw new Error(`unexpected route ${route}`);
    });
  });

  it('offers every persona in the catalog', async () => {
    renderView();
    const options = await screen.findAllByRole('radio');
    // Derived from the contract, not hand-listed: a persona added to the enum
    // must appear here without anyone editing this file.
    expect(options).toHaveLength(assistantPersonaSchema.options.length);
    for (const persona of assistantPersonaSchema.options) {
      expect(screen.getByText(en.persona[persona])).toBeInTheDocument();
    }
  });

  it('marks the stored persona as selected', async () => {
    renderView();
    const selected = await screen.findByRole('radio', { checked: true });
    expect(selected).toHaveTextContent(en.persona[DEFAULT_ASSISTANT_PERSONA]);
  });

  it('saves the persona the user picks', async () => {
    renderView();
    const salma = await screen.findByText(en.persona.salma);
    fireEvent.click(salma);
    await waitFor(() => {
      expect(call).toHaveBeenCalledWith('updateProfile', {
        body: { assistantPersona: 'salma' },
      });
    });
  });

  it('shows each persona its dialect', async () => {
    renderView();
    await screen.findAllByRole('radio');
    for (const persona of assistantPersonaSchema.options) {
      // The dialect is the substantive difference between personas; a picker
      // that hid it would be asking the user to choose on name alone.
      expect(screen.getAllByText(en.dialect[ASSISTANT_PERSONAS[persona].dialect]).length).toBe(1);
    }
  });

  it('says plainly that the voices are synthetic', async () => {
    renderView();
    // A real product claim, not decoration: dialect here is steered by
    // instruction, and the user is entitled to know that before choosing.
    expect(await screen.findByText(en.web.assistant.personaHonesty)).toBeInTheDocument();
  });

  it('renders in Arabic', async () => {
    renderView('ar');
    expect(await screen.findByText(ar.persona.salma)).toBeInTheDocument();
    expect(screen.getByText(ar.web.assistant.personaHonesty)).toBeInTheDocument();
  });
});
