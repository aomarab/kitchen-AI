import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SCHEDULED_REMINDER_TYPES } from '@kitchen/contracts';
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
  stretchCadenceMinutes: 90,
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

/**
 * Every save also carries the browser time zone (quiet hours are wall-clock
 * hours). Building the expectation here keeps the *negative* assertions below
 * honest: a bare `{ body: { … } }` would no longer match anything, so they
 * would pass even if the component did fire the mutation.
 */
const saved = (patch: Record<string, unknown>) => ({
  body: { ...patch, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
});

describe('ReminderSettingsView', () => {
  beforeEach(() => call.mockReset());

  it('turning off a nudge patches just that flag', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const toggle = await screen.findByRole('switch', { name: /hydration reminders/i });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'updateReminderSettings',
        saved({ hydrationEnabled: false }),
      ),
    );
  });

  it('offers a switch for exactly the nudges the engine can fire', async () => {
    // The stretch switch was removed once, because the engine had no cadence
    // for it and it defaulted to on — telling every household that stretch
    // reminders were running. A cadence setting brought it back.
    // `SCHEDULED_REMINDER_TYPES` in the contract decides, not this screen.
    call.mockResolvedValue(settings);
    renderView();
    await screen.findByRole('switch', { name: /hydration reminders/i });
    expect(screen.getAllByRole('switch')).toHaveLength(SCHEDULED_REMINDER_TYPES.length);
    expect(screen.getByRole('switch', { name: /movement breaks/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /stretch reminders/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /morning/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /hydration reminders/i })).toBeTruthy();
  });

  it('choosing a cadence patches breakCadenceMinutes with a number', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const group = await screen.findByRole('group', { name: /break frequency/i });
    fireEvent.click(within(group).getByRole('button', { name: /every 90 min/i }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'updateReminderSettings',
        saved({ breakCadenceMinutes: 90 }),
      ),
    );
    const updateCall = call.mock.calls.filter((c) => c[0] === 'updateReminderSettings').at(-1);
    expect(
      typeof (updateCall![1] as { body: { breakCadenceMinutes: number } }).body.breakCadenceMinutes,
    ).toBe('number');
  });

  it('patches the stretch cadence from its own group, not the break one', async () => {
    // Two identical chip rows are on screen. Picking from the stretch group
    // must never move the break cadence — the defect a shared handler makes.
    call.mockResolvedValue(settings);
    renderView();
    const group = await screen.findByRole('group', { name: /stretch frequency/i });
    fireEvent.click(within(group).getByRole('button', { name: /every 30 min/i }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'updateReminderSettings',
        saved({ stretchCadenceMinutes: 30 }),
      ),
    );
    expect(call).not.toHaveBeenCalledWith(
      'updateReminderSettings',
      saved({ breakCadenceMinutes: 30 }),
    );
  });

  it('marks the chip that matches each saved cadence, separately', async () => {
    call.mockResolvedValue({ ...settings, breakCadenceMinutes: 60, stretchCadenceMinutes: 120 });
    renderView();
    const breaks = await screen.findByRole('group', { name: /break frequency/i });
    const stretch = screen.getByRole('group', { name: /stretch frequency/i });
    expect(within(breaks).getByRole('button', { name: /every 60 min/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(stretch).getByRole('button', { name: /every 120 min/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(stretch).getByRole('button', { name: /every 60 min/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clamps the hydration goal to the contract max on blur', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const input = (await screen.findByLabelText(/daily water goal/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('updateReminderSettings', saved({ hydrationGoalCups: 20 })),
    );
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
    expect(call).not.toHaveBeenCalledWith(
      'updateReminderSettings',
      saved({ hydrationGoalCups: 20 }),
    );
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
    expect(call).not.toHaveBeenCalledWith(
      'updateReminderSettings',
      saved({ hydrationGoalCups: 8 }),
    );
  });

  it('renders in Arabic without throwing', async () => {
    call.mockResolvedValue(settings);
    renderView('ar');
    expect(await screen.findByRole('switch', { name: /تذكيرات الترطيب/ })).toBeInTheDocument();
  });
});
