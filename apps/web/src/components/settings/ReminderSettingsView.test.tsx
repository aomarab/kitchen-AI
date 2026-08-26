import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocaleProvider } from '../../lib/locale';
import { ReminderSettingsView } from './ReminderSettingsView';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const settings = {
  householdId: '11111111-1111-4111-8111-111111111111',
  breakEnabled: true,
  stretchEnabled: true,
  morningEnabled: true,
  hydrationEnabled: true,
  breakCadenceMinutes: 60,
  hydrationGoalCups: 8,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

function renderView(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <ReminderSettingsView />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('ReminderSettingsView', () => {
  beforeEach(() => call.mockReset());

  it('turning off a nudge patches just that flag', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const toggle = await screen.findByRole('switch', { name: /hydration reminders/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(call).toHaveBeenCalledWith('updateReminderSettings', { body: { hydrationEnabled: false } }));
  });

  it('choosing a cadence patches breakCadenceMinutes with a number', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const chip = await screen.findByRole('button', { name: /every 90 min/i });
    fireEvent.click(chip);
    await waitFor(() => expect(call).toHaveBeenCalledWith('updateReminderSettings', { body: { breakCadenceMinutes: 90 } }));
    const updateCall = call.mock.calls.filter((c) => c[0] === 'updateReminderSettings').at(-1);
    expect(typeof (updateCall![1] as { body: { breakCadenceMinutes: number } }).body.breakCadenceMinutes).toBe('number');
  });

  it('clamps the hydration goal to the contract max on blur', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const input = (await screen.findByLabelText(/daily water goal/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    await waitFor(() => expect(call).toHaveBeenCalledWith('updateReminderSettings', { body: { hydrationGoalCups: 20 } }));
    // the uncontrolled field must not keep showing the rejected out-of-range entry
    expect(input.value).toBe('20');
  });

  it('snaps the field to the bound even when the clamp yields no patch', async () => {
    call.mockResolvedValue({ ...settings, hydrationGoalCups: 20 });
    renderView();
    const input = (await screen.findByLabelText(/daily water goal/i)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('20'));
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);
    // 25 clamps to 20, which equals the persisted value → no mutation …
    await new Promise((r) => setTimeout(r, 0));
    expect(call).not.toHaveBeenCalledWith('updateReminderSettings', { body: { hydrationGoalCups: 20 } });
    // … but the display must still correct itself from 25 back to 20
    expect(input.value).toBe('20');
  });

  it('does not patch when the hydration goal is unchanged', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const input = await screen.findByLabelText(/daily water goal/i);
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.blur(input);
    // give any erroneous mutation a chance to fire
    await new Promise((r) => setTimeout(r, 0));
    expect(call).not.toHaveBeenCalledWith('updateReminderSettings', { body: { hydrationGoalCups: 8 } });
  });

  it('renders in Arabic without throwing', async () => {
    call.mockResolvedValue(settings);
    renderView('ar');
    expect(await screen.findByRole('switch', { name: /تذكيرات الترطيب/ })).toBeInTheDocument();
  });
});
