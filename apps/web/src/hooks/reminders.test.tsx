import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { useReminderSettings, useUpdateReminderSettings } from './reminders';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { call } }));
vi.mock('../mocks/provider', () => ({ useMocksReady: () => true }));

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
} as const;

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('reminder settings hooks', () => {
  beforeEach(() => call.mockReset());

  it('reads settings from the getReminderSettings route', async () => {
    call.mockResolvedValue(settings);
    const { result } = renderHook(() => useReminderSettings(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(call).toHaveBeenCalledWith('getReminderSettings');
    expect(result.current.data?.breakCadenceMinutes).toBe(60);
  });

  it('sends only the changed field to updateReminderSettings', async () => {
    call.mockResolvedValue({ ...settings, hydrationEnabled: false });
    const { result } = renderHook(() => useUpdateReminderSettings(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ hydrationEnabled: false });
    });
    expect(call).toHaveBeenCalledWith('updateReminderSettings', { body: { hydrationEnabled: false } });
  });
});
