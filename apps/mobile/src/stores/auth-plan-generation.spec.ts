import { beforeEach, describe, expect, it, vi } from 'vitest';

const { secureStore, fileSystem } = vi.hoisted(() => ({
  secureStore: {
    getItemAsync: vi.fn(async (_key: string) => null as string | null),
    setItemAsync: vi.fn(async (_key: string, _value: string) => undefined),
    deleteItemAsync: vi.fn(async (_key: string) => undefined),
  },
  fileSystem: {
    documentDirectory: 'file:///doc/',
    getInfoAsync: vi.fn(async (_uri: string) => ({ exists: false })),
    readAsStringAsync: vi.fn(async (_uri: string) => '{}'),
    writeAsStringAsync: vi.fn(async (_uri: string, _contents: string) => undefined),
    deleteAsync: vi.fn(async (_uri: string, _options?: { idempotent?: boolean }) => undefined),
  },
}));
vi.mock('expo-secure-store', () => secureStore);
vi.mock('expo-file-system/legacy', () => fileSystem);

import { useAuthStore } from './auth';
import { usePlanGenerationStore } from './plan-generation';

function signInWithHouseholds(activeHouseholdId: string | null = 'home') {
  useAuthStore.setState({
    status: 'signedIn',
    user: {
      id: 'user-1',
      createdAt: '2026-09-29T12:00:00.000Z',
      email: 'chef@kitchen.ai',
      displayName: 'Chef',
      locale: 'en',
      hasPassword: true,
    },
    householdIds: ['home', 'studio'],
    activeHouseholdId,
  });
}

function dirtyPlanGenerationStore() {
  usePlanGenerationStore.setState({
    active: { jobId: 'job-1', scope: 'weekly' },
    failure: {
      scope: 'weekly',
      error: { code: 'PLAN_FAILED', messageKey: 'errors.PLAN_GENERATION_FAILED' },
    },
    readyPlanId: 'plan-1',
  });
}

function expectPlanGenerationReset() {
  expect(usePlanGenerationStore.getState()).toMatchObject({
    active: null,
    failure: null,
    readyPlanId: null,
  });
}

describe('auth household boundaries reset plan generation state', () => {
  beforeEach(() => {
    usePlanGenerationStore.getState().reset();
    useAuthStore.setState({
      status: 'signedOut',
      user: null,
      householdIds: [],
      activeHouseholdId: null,
    });
    secureStore.deleteItemAsync.mockClear();
    fileSystem.writeAsStringAsync.mockClear();
  });

  it('resets a pending or ready generation when the active household changes', () => {
    signInWithHouseholds('home');
    dirtyPlanGenerationStore();

    useAuthStore.getState().setActiveHousehold('studio');

    expect(useAuthStore.getState().activeHouseholdId).toBe('studio');
    expectPlanGenerationReset();
  });

  it('does not reset plan generation state when selecting the already-active household', () => {
    signInWithHouseholds('home');
    usePlanGenerationStore.setState({ readyPlanId: 'plan-1' });

    useAuthStore.getState().setActiveHousehold('home');

    expect(usePlanGenerationStore.getState().readyPlanId).toBe('plan-1');
  });

  it('resets when leaving the active household switches to the next one', () => {
    signInWithHouseholds('home');
    dirtyPlanGenerationStore();

    useAuthStore.getState().removeHousehold('home');

    expect(useAuthStore.getState().activeHouseholdId).toBe('studio');
    expectPlanGenerationReset();
  });

  it('resets when signing out', async () => {
    signInWithHouseholds('home');
    dirtyPlanGenerationStore();

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().status).toBe('signedOut');
    expectPlanGenerationReset();
  });
});
