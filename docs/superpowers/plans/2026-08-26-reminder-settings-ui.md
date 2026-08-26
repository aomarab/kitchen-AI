# Reminder Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web and mobile apps a Settings screen where a household can turn each wellness nudge on/off and set break cadence, hydration goal and quiet hours — backed by the already-shipped `GET/PATCH /reminders/settings` contract.

**Architecture:** Pure client slice on top of the frozen contract from PR #4. Each app adds a typed TanStack Query read + upsert mutation, an MSW resolver so it runs offline, a settings screen built only from existing UI primitives and design tokens, an entry point from the settings index, and bilingual strings. Mobile also extracts the numeric bounds/cadence list into a pure, unit-tested helper (mobile has no render-test harness).

**Tech Stack:** Next.js (App Router) + TanStack Query + MSW on web; Expo Router + TanStack Query + MSW on mobile; Zod contract types from `@kitchen/contracts`; `@kitchen/i18n` catalogs; Vitest (jsdom on web, node on mobile).

**Branch base (read first):** The reminders contract (`packages/contracts/src/reminders.ts`, routes `getReminderSettings`/`updateReminderSettings`) exists **only on `feat/wellness-reminder-settings` (PR #4)**, not on `origin/main`. Create this plan's branch **off `feat/wellness-reminder-settings`** (`git switch feat/wellness-reminder-settings && git switch -c feat/reminder-settings-ui`) so the contract types resolve. The resulting PR stacks on PR #4 and should target it (or `main` once #4 merges).

## Global Constraints

_Copied verbatim from the repo conventions (`.github/copilot-instructions.md`) and the frozen contract; every task below implicitly includes these._

- **Never edit `packages/contracts`.** The contract is frozen. Import `getReminderSettings`, `updateReminderSettings`, `reminderSettingsSchema`, `updateReminderSettingsRequestSchema`, and the types `ReminderSettings`, `UpdateReminderSettingsRequest`, `BreakCadenceMinutes` from `@kitchen/contracts`.
- **Break cadence is a `z.union` of literals — it has NO `.options`.** Enumerate it explicitly as `[30, 60, 90, 120]` typed `BreakCadenceMinutes[]`. Field bounds from the schema: `hydrationGoalCups` int 1–20 (default 8), `quietHoursStart`/`quietHoursEnd` int 0–23 (defaults 22 / 7), the four `*Enabled` booleans default `true`.
- **i18n is parity-checked at build time.** Every key added to `web.en.ts`/`mobile.en.ts` MUST be added to `web.ar.ts`/`mobile.ar.ts` or the build fails. Catalogs are append-only per app: web writes `web.*` only, mobile writes `mobile.*` only. Do not touch coordinator-owned `en.ts`/`ar.ts`.
- **No physical-direction styles.** Web: use `ms/me`, `ps/pe`, `start/end`, `text-start`; never `ml-*`, `pl-*`, `left-*`, `text-left`, `border-l-*`, `rounded-l-*`. Mobile: use `marginStart`/`paddingStart`/`start`/`end`; never `marginLeft`/`left`/`borderRightColor`. Direction-implying icons go through `DirectionalIcon`.
- **Design tokens by name only.** No hex literals in components. On web never put `text-primary` on text (use `text-primary-text`); never use opacity tints like `bg-primary/8` (use a solid `*-soft` token). Reuse existing tokens (`text-foreground`, `text-muted-foreground`, `text-danger`, `bg-danger-soft`, `border-border`, `focus-visible:ring-primary`).
- **Web relative imports carry NO file extension** (unlike the API's `.js`). Mobile likewise.
- **Server state is TanStack Query; MSW serves every request in dev/test.** Web dev runs mock-mode (`pnpm dev` sets `NEXT_PUBLIC_API_MOCK=true`); mobile uses MSW unless `EXPO_PUBLIC_USE_MOCKS=false`. A mobile route the app calls via `api.call` MUST have a resolver or `mocks/coverage.spec.ts` fails.
- **Mobile tests are node-only pure logic** — no native render harness. Screens are verified by typecheck + lint + `coverage.spec.ts`; extract testable logic into `src/lib`.
- Household-scoped data: both routes send `x-household-id` automatically via the app's api client (`getHouseholdId` is already wired). No header handling needed in UI code.

---

## File Structure

**Shared i18n (Task 1):**
- Modify `packages/i18n/src/web.en.ts` + `packages/i18n/src/web.ar.ts` — `web.reminders.*`.
- Modify `packages/i18n/src/mobile.en.ts` + `packages/i18n/src/mobile.ar.ts` — `mobile.reminders.*`.

**Web (Tasks 2–3):**
- Modify `apps/web/src/mocks/db.ts` — seed `db.reminderSettings`.
- Modify `apps/web/src/mocks/handlers.ts` — `GET`/`PATCH /reminders/settings` resolvers.
- Modify `apps/web/src/hooks/settings.ts` — `useReminderSettings`, `useUpdateReminderSettings`.
- Create `apps/web/src/hooks/reminders.test.tsx` — hook behaviour.
- Create `apps/web/src/components/settings/ReminderSettingsView.tsx` — the screen.
- Create `apps/web/src/components/settings/ReminderSettingsView.test.tsx` — component behaviour.
- Create `apps/web/src/app/(app)/settings/reminders/page.tsx` — route.
- Modify `apps/web/src/components/settings/SettingsView.tsx` — entry card + link.

**Mobile (Tasks 4–6):**
- Create `apps/mobile/src/lib/reminders.ts` — pure bounds/cadence helpers.
- Create `apps/mobile/src/lib/reminders.spec.ts` — helper tests.
- Modify `apps/mobile/src/hooks/keys.ts` — `qk.reminders`.
- Create `apps/mobile/src/hooks/reminders.ts` — `useReminderSettings`, `useUpdateReminderSettings`.
- Modify `apps/mobile/src/mocks/data.ts` — `mockReminderSettings`.
- Modify `apps/mobile/src/mocks/handlers.ts` — `db.reminderSettings` + resolvers.
- Create `apps/mobile/src/app/settings/reminders.tsx` — the screen.
- Modify `apps/mobile/src/app/settings/index.tsx` — `ListRow` entry.

---

### Task 1: Bilingual reminder strings (web + mobile)

**Files:**
- Modify: `packages/i18n/src/web.en.ts`, `packages/i18n/src/web.ar.ts`
- Modify: `packages/i18n/src/mobile.en.ts`, `packages/i18n/src/mobile.ar.ts`
- Test: `packages/i18n/src/catalog.spec.ts` (existing parity test — do not edit, just run)

**Interfaces:**
- Produces (identical key set under both `web.reminders` and `mobile.reminders`): `title`, `entry`, `entryHint`, `subtitle`, `nudgesTitle`, `breakLabel`, `breakHint`, `stretchLabel`, `stretchHint`, `morningLabel`, `morningHint`, `hydrationLabel`, `hydrationHint`, `cadenceTitle`, `cadenceEvery` (param `minutes`), `hydrationGoalTitle`, `hydrationGoalValue` (plural param `count`), `quietHoursTitle`, `quietHoursHint`, `quietFrom`, `quietTo`, `hourValue` (param `hour`), `saved`, `saveFailed`, `decrease`, `increase`.

- [ ] **Step 1: Add the English web block.** In `packages/i18n/src/web.en.ts`, inside `web: { … }`, add a `reminders` group after the existing `feedback` group. `plural` is already imported in this file.

```ts
    reminders: {
      title: 'Wellness reminders',
      entry: 'Wellness reminders',
      entryHint: 'Gentle nudges to move, stretch and drink water.',
      subtitle: 'Choose which nudges you get and when.',
      nudgesTitle: 'Nudges',
      breakLabel: 'Movement breaks',
      breakHint: 'A reminder to stand up and move.',
      stretchLabel: 'Stretch reminders',
      stretchHint: 'A prompt to loosen up.',
      morningLabel: 'Morning kickstart',
      morningHint: 'A start-of-day hello.',
      hydrationLabel: 'Hydration reminders',
      hydrationHint: 'A reminder to drink water.',
      cadenceTitle: 'Break frequency',
      cadenceEvery: 'Every {minutes} min',
      hydrationGoalTitle: 'Daily water goal',
      hydrationGoalValue: plural('count', { one: '{count} cup', other: '{count} cups' }),
      quietHoursTitle: 'Quiet hours',
      quietHoursHint: 'No nudges during this window.',
      quietFrom: 'From',
      quietTo: 'To',
      hourValue: '{hour}:00',
      saved: 'Saved',
      saveFailed: 'Could not save. Please try again.',
      decrease: 'Decrease',
      increase: 'Increase',
    },
```

- [ ] **Step 2: Add the Arabic web block.** In `packages/i18n/src/web.ar.ts`, add the same `reminders` group in the same position, translated:

```ts
    reminders: {
      title: 'تذكيرات العافية',
      entry: 'تذكيرات العافية',
      entryHint: 'تنبيهات لطيفة للحركة والتمدد وشرب الماء.',
      subtitle: 'اختر التنبيهات التي تصلك ومواعيدها.',
      nudgesTitle: 'التنبيهات',
      breakLabel: 'فترات الحركة',
      breakHint: 'تذكير بالوقوف والحركة.',
      stretchLabel: 'تذكيرات التمدد',
      stretchHint: 'تنبيه لتمديد الجسم.',
      morningLabel: 'انطلاقة الصباح',
      morningHint: 'تحية بداية اليوم.',
      hydrationLabel: 'تذكيرات الترطيب',
      hydrationHint: 'تذكير بشرب الماء.',
      cadenceTitle: 'تكرار الفترات',
      cadenceEvery: 'كل {minutes} دقيقة',
      hydrationGoalTitle: 'هدف الماء اليومي',
      hydrationGoalValue: plural('count', {
        one: 'كوب واحد',
        two: 'كوبان',
        few: '{count} أكواب',
        many: '{count} كوبًا',
        other: '{count} كوب',
      }),
      quietHoursTitle: 'ساعات الهدوء',
      quietHoursHint: 'لا تنبيهات خلال هذه الفترة.',
      quietFrom: 'من',
      quietTo: 'إلى',
      hourValue: '{hour}:٠٠',
      saved: 'تم الحفظ',
      saveFailed: 'تعذّر الحفظ. حاول مرة أخرى.',
      decrease: 'إنقاص',
      increase: 'زيادة',
    },
```

- [ ] **Step 3: Add the mobile blocks.** Repeat Steps 1–2 in `packages/i18n/src/mobile.en.ts` and `packages/i18n/src/mobile.ar.ts`, inside `mobile: { … }`, adding a `reminders` group with the **same keys and values** after the existing `feedback` group. (`plural` is imported in these files too — confirm the import line exists; the feedback block already uses `plural`.)

- [ ] **Step 4: Build the catalog and run parity.**

Run: `pnpm --filter @kitchen/i18n build && pnpm --filter @kitchen/i18n exec vitest run src/catalog.spec.ts`
Expected: build succeeds (proves `ar` is assignable to the `en`-derived type, i.e. no missing key) and the catalog spec passes.

- [ ] **Step 5: Commit.**

```bash
git add packages/i18n/src/web.en.ts packages/i18n/src/web.ar.ts packages/i18n/src/mobile.en.ts packages/i18n/src/mobile.ar.ts
git commit -m "feat(i18n): add reminder settings strings (web + mobile)"
```

---

### Task 2: Web data layer — mock resolvers + query hooks

**Files:**
- Modify: `apps/web/src/mocks/db.ts`
- Modify: `apps/web/src/mocks/handlers.ts`
- Modify: `apps/web/src/hooks/settings.ts`
- Test: `apps/web/src/hooks/reminders.test.tsx` (create)

**Interfaces:**
- Consumes: `ReminderSettings`, `UpdateReminderSettingsRequest` from `@kitchen/contracts`; `api.call('getReminderSettings')` → `Promise<ReminderSettings>`, `api.call('updateReminderSettings', { body })` → `Promise<ReminderSettings>`; `db` and `DEFAULT_HOUSEHOLD_ID` from `../../mocks/db`; `useMocksReady` from `../mocks/provider`.
- Produces: `useReminderSettings(): UseQueryResult<ReminderSettings>` (query key `['reminders']`), `useUpdateReminderSettings(): UseMutationResult<ReminderSettings, unknown, UpdateReminderSettingsRequest>` with optimistic cache write on `['reminders']`.

- [ ] **Step 1: Seed the mock row.** In `apps/web/src/mocks/db.ts`: add `ReminderSettings` to the type-only import from `@kitchen/contracts`; add `reminderSettings: ReminderSettings;` to `interface DbShape`; and in `seed()` (near `db.profile = …`) add:

```ts
  db.reminderSettings = {
    householdId: DEFAULT_HOUSEHOLD_ID,
    breakEnabled: true,
    stretchEnabled: true,
    morningEnabled: true,
    hydrationEnabled: true,
    breakCadenceMinutes: 60,
    hydrationGoalCups: 8,
    quietHoursStart: 22,
    quietHoursEnd: 7,
  };
```

- [ ] **Step 2: Add the resolvers.** In `apps/web/src/mocks/handlers.ts`: add `UpdateReminderSettingsRequest` to the type-only `@kitchen/contracts` import, and add these two handlers to the `handlers` array right after the `http.patch(u('/profile'), …)` handler:

```ts
  http.get(u('/reminders/settings'), async () => HttpResponse.json(db.reminderSettings)),
  http.patch(u('/reminders/settings'), async ({ request }) => {
    const body = (await request.json()) as UpdateReminderSettingsRequest;
    db.reminderSettings = { ...db.reminderSettings, ...body };
    return HttpResponse.json(db.reminderSettings);
  }),
```

- [ ] **Step 3: Write the failing hook test.** Create `apps/web/src/hooks/reminders.test.tsx`:

```tsx
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
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
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
```

- [ ] **Step 4: Run it to confirm it fails.**

Run: `pnpm --filter @kitchen/web exec vitest run src/hooks/reminders.test.tsx`
Expected: FAIL — `useReminderSettings`/`useUpdateReminderSettings` not exported from `./reminders`.

- [ ] **Step 5: Implement the hooks.** Append to `apps/web/src/hooks/settings.ts`, then re-export from a new `apps/web/src/hooks/reminders.ts` so the test's import path is stable. Add to `settings.ts`:

```ts
import type { ReminderSettings, UpdateReminderSettingsRequest } from '@kitchen/contracts';

export function useReminderSettings() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['reminders'],
    queryFn: () => api.call('getReminderSettings'),
    enabled: ready,
  });
}

export function useUpdateReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateReminderSettingsRequest) => api.call('updateReminderSettings', { body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['reminders'] });
      const previous = qc.getQueryData<ReminderSettings>(['reminders']);
      if (previous) qc.setQueryData<ReminderSettings>(['reminders'], { ...previous, ...body });
      const optimistic = previous ? qc.getQueryData<ReminderSettings>(['reminders']) : undefined;
      return { previous, optimistic };
    },
    onError: (_error, _body, context) => {
      if (!context?.previous || !context.optimistic) return;
      if (qc.getQueryData<ReminderSettings>(['reminders']) !== context.optimistic) return;
      qc.setQueryData(['reminders'], context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}
```

Merge the new type import into the existing `import type { Profile, UpdateProfileRequest } from '@kitchen/contracts';` line rather than duplicating it. Then create `apps/web/src/hooks/reminders.ts`:

```ts
export { useReminderSettings, useUpdateReminderSettings } from './settings';
```

- [ ] **Step 6: Run the test to confirm it passes.**

Run: `pnpm --filter @kitchen/web exec vitest run src/hooks/reminders.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/mocks/db.ts apps/web/src/mocks/handlers.ts apps/web/src/hooks/settings.ts apps/web/src/hooks/reminders.ts apps/web/src/hooks/reminders.test.tsx
git commit -m "feat(web): add reminder settings query + mutation hooks and mock"
```

---

### Task 3: Web UI — ReminderSettingsView, route, settings entry

**Files:**
- Create: `apps/web/src/components/settings/ReminderSettingsView.tsx`
- Create: `apps/web/src/components/settings/ReminderSettingsView.test.tsx`
- Create: `apps/web/src/app/(app)/settings/reminders/page.tsx`
- Modify: `apps/web/src/components/settings/SettingsView.tsx`

**Interfaces:**
- Consumes: `useReminderSettings`, `useUpdateReminderSettings` (Task 2); `useLocale` from `../../lib/locale`; `translateErrorKey` from `@kitchen/i18n`; `resolveErrorKey` from `../../lib/errors`; `Card`, `CardHeader`, `CardTitle` from `../ui/Card`; `Badge` from `../ui/Badge`; `Input`, `Field` from `../ui/Input`; `LoadingState`, `ErrorState` from `../ui/states`; `buttonClasses` from `../ui/Button`; `BreakCadenceMinutes`, `UpdateReminderSettingsRequest` from `@kitchen/contracts`. i18n keys `web.reminders.*` (Task 1).
- Produces: `ReminderSettingsView` React component (default consumed by the route); a settings entry card linking to `/settings/reminders`.

- [ ] **Step 1: Write the failing component test.** Create `apps/web/src/components/settings/ReminderSettingsView.test.tsx`:

```tsx
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
    expect(typeof call.mock.calls.at(-1)![1].body.breakCadenceMinutes).toBe('number');
  });

  it('clamps the hydration goal to the contract max on blur', async () => {
    call.mockResolvedValue(settings);
    renderView();
    const input = await screen.findByLabelText(/daily water goal/i);
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    await waitFor(() => expect(call).toHaveBeenCalledWith('updateReminderSettings', { body: { hydrationGoalCups: 20 } }));
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
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/settings/ReminderSettingsView.test.tsx`
Expected: FAIL — `ReminderSettingsView` module does not exist.

- [ ] **Step 3: Implement the component.** Create `apps/web/src/components/settings/ReminderSettingsView.tsx`. Toggles are native checkboxes with `role="switch"` (mirrors the halal checkbox in `SettingsView`, plus `role="switch"` so the test can target them); cadence is the `Chip` pattern; goal and quiet hours are numeric `Input`s that clamp and only patch on change.

```tsx
'use client';

import type { BreakCadenceMinutes, ReminderSettings, UpdateReminderSettingsRequest } from '@kitchen/contracts';
import { translateErrorKey } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { resolveErrorKey } from '../../lib/errors';
import { cn } from '../../lib/cn';
import { useReminderSettings, useUpdateReminderSettings } from '../../hooks/reminders';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input, Field } from '../ui/Input';
import { LoadingState, ErrorState } from '../ui/states';

const CADENCES: BreakCadenceMinutes[] = [30, 60, 90, 120];

type ToggleKey = 'breakEnabled' | 'stretchEnabled' | 'morningEnabled' | 'hydrationEnabled';

export function ReminderSettingsView() {
  const { t, locale } = useLocale();
  const query = useReminderSettings();
  const update = useUpdateReminderSettings();

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const settings: ReminderSettings = query.data;
  const save = (patch: UpdateReminderSettingsRequest) => update.mutate(patch);

  const toggles: { key: ToggleKey; label: string; hint: string }[] = [
    { key: 'breakEnabled', label: t('web.reminders.breakLabel'), hint: t('web.reminders.breakHint') },
    { key: 'stretchEnabled', label: t('web.reminders.stretchLabel'), hint: t('web.reminders.stretchHint') },
    { key: 'morningEnabled', label: t('web.reminders.morningLabel'), hint: t('web.reminders.morningHint') },
    { key: 'hydrationEnabled', label: t('web.reminders.hydrationLabel'), hint: t('web.reminders.hydrationHint') },
  ];

  const clampHour = (raw: string, current: number, key: 'quietHoursStart' | 'quietHoursEnd') => {
    const next = Math.min(23, Math.max(0, Math.round(Number(raw))));
    if (Number.isFinite(next) && next !== current) save({ [key]: next });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('web.reminders.title')}</CardTitle>
          {update.isSuccess ? <Badge tone="success">{t('web.reminders.saved')}</Badge> : null}
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.reminders.subtitle')}</p>
      </Card>

      <Card className="flex flex-col gap-5">
        <CardHeader>
          <CardTitle>{t('web.reminders.nudgesTitle')}</CardTitle>
        </CardHeader>
        {toggles.map(({ key, label, hint }) => (
          <section key={key} className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">{label}</h3>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={settings[key]}
              onChange={(e) => save({ [key]: e.target.checked })}
              aria-label={label}
              className="h-5 w-5 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
          </section>
        ))}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardHeader>
          <CardTitle>{t('web.reminders.cadenceTitle')}</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {CADENCES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={settings.breakCadenceMinutes === c}
              onClick={() => save({ breakCadenceMinutes: c })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                settings.breakCadenceMinutes === c
                  ? 'border-primary-text bg-primary-soft text-primary-text'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t('web.reminders.cadenceEvery', { minutes: c })}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>{t('web.reminders.hydrationGoalTitle')}</CardTitle>
        </CardHeader>
        <Field label={t('web.reminders.hydrationGoalTitle')} htmlFor="hydration-goal">
          <Input
            id="hydration-goal"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={settings.hydrationGoalCups}
            onBlur={(e) => {
              const next = Math.min(20, Math.max(1, Math.round(Number(e.target.value))));
              if (Number.isFinite(next) && next !== settings.hydrationGoalCups) save({ hydrationGoalCups: next });
            }}
            className="w-32"
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>{t('web.reminders.quietHoursTitle')}</CardTitle>
        </CardHeader>
        <p className="text-xs text-muted-foreground">{t('web.reminders.quietHoursHint')}</p>
        <div className="flex flex-wrap gap-4">
          <Field label={t('web.reminders.quietFrom')} htmlFor="quiet-start">
            <Input
              id="quiet-start"
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              defaultValue={settings.quietHoursStart}
              onBlur={(e) => clampHour(e.target.value, settings.quietHoursStart, 'quietHoursStart')}
              className="w-24"
            />
          </Field>
          <Field label={t('web.reminders.quietTo')} htmlFor="quiet-end">
            <Input
              id="quiet-end"
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              defaultValue={settings.quietHoursEnd}
              onBlur={(e) => clampHour(e.target.value, settings.quietHoursEnd, 'quietHoursEnd')}
              className="w-24"
            />
          </Field>
        </div>
      </Card>

      {update.isError ? (
        <p role="alert" className="text-sm text-danger">
          {translateErrorKey(locale, resolveErrorKey(update.error))}
        </p>
      ) : null}
    </div>
  );
}
```

Note: `[key]: value` computed-key patches are typed against `UpdateReminderSettingsRequest`; if TypeScript widens the key, type the arrays as shown (`ToggleKey`) so each `save` argument stays a valid partial. Verify `Field` accepts `htmlFor` and `Input` forwards `id` (they do — see `SettingsView` household-size usage).

- [ ] **Step 4: Run the component test to confirm it passes.**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/settings/ReminderSettingsView.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the route.** Create `apps/web/src/app/(app)/settings/reminders/page.tsx` (mirrors the feedback route):

```tsx
import { ReminderSettingsView } from '../../../../components/settings/ReminderSettingsView';

export default function RemindersPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <ReminderSettingsView />
    </div>
  );
}
```

- [ ] **Step 6: Add the settings entry.** In `apps/web/src/components/settings/SettingsView.tsx`, add a `Card` with a `Link` to `/settings/reminders` immediately before the existing feedback entry `Card` (the one titled `t('web.feedback.entry')`). `Link` and `buttonClasses` are already imported in that file:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>{t('web.reminders.entry')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.reminders.entryHint')}</p>
        <Link href="/settings/reminders" className={buttonClasses({ className: 'mt-4' })}>
          {t('web.reminders.title')}
        </Link>
      </Card>
```

- [ ] **Step 7: Verify the web app builds and the token/lint gates pass.**

Run: `pnpm --filter @kitchen/web exec vitest run src/components/settings/ReminderSettingsView.test.tsx src/hooks/reminders.test.tsx src/lib/token-usage.test.ts && pnpm --filter @kitchen/web lint`
Expected: all pass — including `token-usage` (proves no hex literals, no `text-primary` on text, no opacity tints in the new component) and eslint (proves no physical-direction utilities).

- [ ] **Step 8: Commit.**

```bash
git add apps/web/src/components/settings/ReminderSettingsView.tsx apps/web/src/components/settings/ReminderSettingsView.test.tsx "apps/web/src/app/(app)/settings/reminders/page.tsx" apps/web/src/components/settings/SettingsView.tsx
git commit -m "feat(web): reminder settings screen, route and settings entry"
```

---

### Task 4: Mobile logic — reminder bounds/cadence helper

**Files:**
- Create: `apps/mobile/src/lib/reminders.ts`
- Test: `apps/mobile/src/lib/reminders.spec.ts`

**Interfaces:**
- Consumes: `BreakCadenceMinutes` from `@kitchen/contracts`.
- Produces: `BREAK_CADENCES: readonly BreakCadenceMinutes[]`; `HYDRATION_MIN`/`HYDRATION_MAX`/`QUIET_MIN`/`QUIET_MAX` numbers; `clampHydrationGoal(n: number): number`; `clampQuietHour(n: number): number`; `isBreakCadence(n: number): n is BreakCadenceMinutes`.

- [ ] **Step 1: Write the failing test.** Create `apps/mobile/src/lib/reminders.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BREAK_CADENCES, clampHydrationGoal, clampQuietHour, isBreakCadence } from './reminders';

describe('reminder helpers', () => {
  it('offers exactly the four contract cadences in order', () => {
    expect([...BREAK_CADENCES]).toEqual([30, 60, 90, 120]);
  });

  it('clamps the hydration goal into 1..20 and rounds', () => {
    expect(clampHydrationGoal(0)).toBe(1);
    expect(clampHydrationGoal(21)).toBe(20);
    expect(clampHydrationGoal(7.6)).toBe(8);
  });

  it('clamps a quiet hour into 0..23 and rounds', () => {
    expect(clampQuietHour(-1)).toBe(0);
    expect(clampQuietHour(24)).toBe(23);
    expect(clampQuietHour(22.2)).toBe(22);
  });

  it('recognises only the four fixed cadences', () => {
    expect(isBreakCadence(90)).toBe(true);
    expect(isBreakCadence(45)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/reminders.spec.ts`
Expected: FAIL — `./reminders` not found.

- [ ] **Step 3: Implement the helper.** Create `apps/mobile/src/lib/reminders.ts`:

```ts
import type { BreakCadenceMinutes } from '@kitchen/contracts';

export const BREAK_CADENCES: readonly BreakCadenceMinutes[] = [30, 60, 90, 120] as const;

export const HYDRATION_MIN = 1;
export const HYDRATION_MAX = 20;
export const QUIET_MIN = 0;
export const QUIET_MAX = 23;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n)));

export function clampHydrationGoal(n: number): number {
  return clamp(n, HYDRATION_MIN, HYDRATION_MAX);
}

export function clampQuietHour(n: number): number {
  return clamp(n, QUIET_MIN, QUIET_MAX);
}

export function isBreakCadence(n: number): n is BreakCadenceMinutes {
  return (BREAK_CADENCES as readonly number[]).includes(n);
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `pnpm --filter @kitchen/mobile exec vitest run src/lib/reminders.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/mobile/src/lib/reminders.ts apps/mobile/src/lib/reminders.spec.ts
git commit -m "feat(mobile): add reminder settings bounds/cadence helper"
```

---

### Task 5: Mobile data layer — query hooks + mock resolvers

**Files:**
- Modify: `apps/mobile/src/hooks/keys.ts`
- Create: `apps/mobile/src/hooks/reminders.ts`
- Modify: `apps/mobile/src/mocks/data.ts`
- Modify: `apps/mobile/src/mocks/handlers.ts`
- Test: `apps/mobile/src/mocks/coverage.spec.ts` (existing — run, do not edit)

**Interfaces:**
- Consumes: `RouteBody` type helper and `ReminderSettings` from `@kitchen/contracts`; `api` from `../lib/api`; `qk` from `./keys`; `HOUSEHOLD_ID` from `../mocks/data`; the mock `db` in `handlers.ts`.
- Produces: `qk.reminders` = `['reminders'] as const`; `useReminderSettings()` (query key `qk.reminders`, calls `api.call('getReminderSettings')`); `useUpdateReminderSettings()` (calls `api.call('updateReminderSettings', { body })`, invalidates `qk.reminders`); mock `getReminderSettings`/`updateReminderSettings` resolvers; `mockReminderSettings: ReminderSettings`.

- [ ] **Step 1: Add the query key.** In `apps/mobile/src/hooks/keys.ts`, add to the `qk` object (near `profile`):

```ts
  reminders: ['reminders'] as const,
```

- [ ] **Step 2: Add the hooks.** Create `apps/mobile/src/hooks/reminders.ts` (mirrors `hooks/profile.ts`):

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { qk } from './keys';

export function useReminderSettings() {
  return useQuery({ queryKey: qk.reminders, queryFn: () => api.call('getReminderSettings') });
}

export function useUpdateReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'updateReminderSettings'>) => api.call('updateReminderSettings', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reminders }),
  });
}
```

- [ ] **Step 3: Seed the mock row.** In `apps/mobile/src/mocks/data.ts`, add `ReminderSettings` to the `@kitchen/contracts` type import and, after `mockProfile`, add:

```ts
export const mockReminderSettings: ReminderSettings = {
  householdId: HOUSEHOLD_ID,
  breakEnabled: true,
  stretchEnabled: true,
  morningEnabled: true,
  hydrationEnabled: true,
  breakCadenceMinutes: 60,
  hydrationGoalCups: 8,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};
```

- [ ] **Step 4: Wire the resolvers.** In `apps/mobile/src/mocks/handlers.ts`: import `mockReminderSettings` from `./data`; add `reminderSettings: { ...mockReminderSettings },` to the `db` object literal; and add these two entries to the `resolvers` map right after `updateProfile`:

```ts
  getReminderSettings: () => HttpResponse.json(db.reminderSettings),
  updateReminderSettings: async ({ request }) => {
    const body = await readBody(request);
    db.reminderSettings = { ...db.reminderSettings, ...(body as object) };
    return HttpResponse.json(db.reminderSettings);
  },
```

- [ ] **Step 5: Run coverage + typecheck.** (The screen in Task 6 is what makes `coverage.spec` *require* these resolvers, but adding them now keeps this task self-consistent and the resolver-name/route cross-check green.)

Run: `pnpm --filter @kitchen/mobile exec vitest run src/mocks/coverage.spec.ts && pnpm --filter @kitchen/mobile typecheck`
Expected: PASS — no unknown resolver (`getReminderSettings`/`updateReminderSettings` are real routes) and types resolve.

- [ ] **Step 6: Commit.**

```bash
git add apps/mobile/src/hooks/keys.ts apps/mobile/src/hooks/reminders.ts apps/mobile/src/mocks/data.ts apps/mobile/src/mocks/handlers.ts
git commit -m "feat(mobile): add reminder settings hooks and mock resolvers"
```

---

### Task 6: Mobile UI — reminders screen + settings entry

**Files:**
- Create: `apps/mobile/src/app/settings/reminders.tsx`
- Modify: `apps/mobile/src/app/settings/index.tsx`
- Test: `apps/mobile/src/mocks/coverage.spec.ts` (existing — run)

**Interfaces:**
- Consumes: `useReminderSettings`, `useUpdateReminderSettings` (Task 5); `BREAK_CADENCES`, `clampHydrationGoal`, `clampQuietHour` (Task 4); `Screen`, `Header`, `AppText`, `Card`, `ToggleRow`, `SegmentedControl`, `QuantityStepper`, `Badge`, `LoadingState`, `ErrorState` from `../../components`; `useFormat` from `../../hooks/useFormat`; `spacing` from `../../theme`; `BreakCadenceMinutes` from `@kitchen/contracts`; i18n keys `mobile.reminders.*` (Task 1).
- Produces: the `/settings/reminders` Expo Router screen and the settings-index row that navigates to it.

- [ ] **Step 1: Build the screen.** Create `apps/mobile/src/app/settings/reminders.tsx` (loading/error guards mirror `settings/household.tsx`; controls are the existing `ToggleRow`/`SegmentedControl`/`QuantityStepper`, none of which use physical-direction style keys):

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import type { BreakCadenceMinutes } from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Card,
  ToggleRow,
  SegmentedControl,
  QuantityStepper,
  LoadingState,
  ErrorState,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useReminderSettings, useUpdateReminderSettings } from '../../hooks/reminders';
import { BREAK_CADENCES, clampHydrationGoal, clampQuietHour } from '../../lib/reminders';
import { spacing } from '../../theme';

export default function Reminders() {
  const { t } = useFormat();
  const router = useRouter();
  const query = useReminderSettings();
  const update = useUpdateReminderSettings();

  const frame = (child: React.ReactNode) => (
    <Screen scroll>
      <Header title={t('mobile.reminders.title')} onBack={() => router.back()} />
      {child}
    </Screen>
  );

  if (query.isLoading) return frame(<LoadingState />);
  if (query.isError) return frame(<ErrorState error={query.error} onRetry={() => void query.refetch()} />);
  if (!query.data) return frame(null);

  const s = query.data;
  const cadenceOptions = BREAK_CADENCES.map((c) => ({
    value: String(c),
    label: t('mobile.reminders.cadenceEvery', { minutes: c }),
  }));

  return (
    <Screen scroll>
      <Header title={t('mobile.reminders.title')} onBack={() => router.back()} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="caption" muted style={{ flex: 1 }}>
          {t('mobile.reminders.subtitle')}
        </AppText>
        {update.isSuccess ? <Badge tone="info" label={t('mobile.reminders.saved')} /> : null}
      </View>

      <Card style={{ gap: spacing.lg }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.nudgesTitle')}
        </AppText>
        <ToggleRow
          label={t('mobile.reminders.breakLabel')}
          hint={t('mobile.reminders.breakHint')}
          value={s.breakEnabled}
          onValueChange={(v) => update.mutate({ breakEnabled: v })}
        />
        <ToggleRow
          label={t('mobile.reminders.stretchLabel')}
          hint={t('mobile.reminders.stretchHint')}
          value={s.stretchEnabled}
          onValueChange={(v) => update.mutate({ stretchEnabled: v })}
        />
        <ToggleRow
          label={t('mobile.reminders.morningLabel')}
          hint={t('mobile.reminders.morningHint')}
          value={s.morningEnabled}
          onValueChange={(v) => update.mutate({ morningEnabled: v })}
        />
        <ToggleRow
          label={t('mobile.reminders.hydrationLabel')}
          hint={t('mobile.reminders.hydrationHint')}
          value={s.hydrationEnabled}
          onValueChange={(v) => update.mutate({ hydrationEnabled: v })}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.cadenceTitle')}
        </AppText>
        <SegmentedControl
          options={cadenceOptions}
          value={String(s.breakCadenceMinutes)}
          onChange={(v) => update.mutate({ breakCadenceMinutes: Number(v) as BreakCadenceMinutes })}
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.hydrationGoalTitle')}
        </AppText>
        <QuantityStepper
          value={s.hydrationGoalCups}
          onChange={(v) => update.mutate({ hydrationGoalCups: clampHydrationGoal(v) })}
          min={1}
          label={t('mobile.reminders.hydrationGoalValue', { count: s.hydrationGoalCups })}
          decrementLabel={t('mobile.reminders.decrease')}
          incrementLabel={t('mobile.reminders.increase')}
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.quietHoursTitle')}
        </AppText>
        <AppText variant="caption" muted>
          {t('mobile.reminders.quietHoursHint')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="body" style={{ minWidth: 44 }}>
            {t('mobile.reminders.quietFrom')}
          </AppText>
          <QuantityStepper
            value={s.quietHoursStart}
            onChange={(v) => update.mutate({ quietHoursStart: clampQuietHour(v) })}
            min={0}
            label={t('mobile.reminders.hourValue', { hour: s.quietHoursStart })}
            decrementLabel={t('mobile.reminders.decrease')}
            incrementLabel={t('mobile.reminders.increase')}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="body" style={{ minWidth: 44 }}>
            {t('mobile.reminders.quietTo')}
          </AppText>
          <QuantityStepper
            value={s.quietHoursEnd}
            onChange={(v) => update.mutate({ quietHoursEnd: clampQuietHour(v) })}
            min={0}
            label={t('mobile.reminders.hourValue', { hour: s.quietHoursEnd })}
            decrementLabel={t('mobile.reminders.decrease')}
            incrementLabel={t('mobile.reminders.increase')}
          />
        </View>
      </Card>

      {update.isError ? (
        <AppText variant="caption" accessibilityRole="alert" style={{ color: undefined }}>
          {t('mobile.reminders.saveFailed')}
        </AppText>
      ) : null}
    </Screen>
  );
}
```

For the error line, match `feedback.tsx`: `import { colors } from '../../theme';` and use `style={{ color: colors.danger }}` (replace the `style={{ color: undefined }}` placeholder above — it is only there so the block reads clearly). Note the `QuantityStepper` `increment` has no built-in max, so the `onChange` clamps with the Task 4 helpers, which is what keeps hydration ≤ 20 and hours ≤ 23. Confirm `Badge`, `SegmentedControl`, `QuantityStepper`, `LoadingState`, `ErrorState` are all re-exported from `apps/mobile/src/components/index.ts`; if any is not, import it from its file directly.

- [ ] **Step 2: Add the settings-index row.** In `apps/mobile/src/app/settings/index.tsx`, add a `ListRow` immediately before the existing feedback `ListRow`:

```tsx
      <ListRow
        title={t('mobile.reminders.entry')}
        subtitle={t('mobile.reminders.entryHint')}
        showChevron
        onPress={() => router.push('/settings/reminders')}
      />
```

- [ ] **Step 3: Run coverage, typecheck and lint.** The screen now calls `getReminderSettings`/`updateReminderSettings`, so `coverage.spec` proves the resolvers exist; lint proves no physical-direction style keys slipped in.

Run: `pnpm --filter @kitchen/mobile exec vitest run src/mocks/coverage.spec.ts && pnpm --filter @kitchen/mobile typecheck && pnpm --filter @kitchen/mobile lint`
Expected: all PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/mobile/src/app/settings/reminders.tsx apps/mobile/src/app/settings/index.tsx
git commit -m "feat(mobile): reminder settings screen and settings entry"
```

---

## Whole-slice verification (run after Task 6)

- [ ] `pnpm build` — turbo builds contracts/i18n first (their `dist` feeds the apps).
- [ ] `pnpm typecheck` — whole workspace (proves i18n parity types + computed-key patches).
- [ ] `pnpm lint` — whole workspace (RTL/direction + token utilities).
- [ ] `pnpm --filter @kitchen/web exec vitest run` and `pnpm --filter @kitchen/mobile exec vitest run` — both app suites, including the new tests and the guard tests (`token-usage`, `palette`, `coverage`).
- [ ] Playwright MCP against `pnpm dev` (`http://localhost:3100`): open `/settings/reminders`, toggle a nudge, pick a cadence, change the water goal; switch locale to Arabic and confirm the layout mirrors (sidebar right, controls RTL) and the strings are Arabic.

## Self-Review

**Spec coverage:** Every contract field is user-editable — four `*Enabled` toggles (Task 3/6), `breakCadenceMinutes` via the four-cadence selector (`CADENCES`/`BREAK_CADENCES`), `hydrationGoalCups` (bounded 1–20), `quietHoursStart`/`quietHoursEnd` (bounded 0–23). Both platforms read via a get-or-default query and write via the partial upsert mutation, and both have MSW resolvers so they run offline. Strings exist in all four catalogs.

**Type consistency:** `useReminderSettings`/`useUpdateReminderSettings` names match across web (`hooks/settings.ts` re-exported by `hooks/reminders.ts`) and mobile (`hooks/reminders.ts`). Cadence is enumerated (`CADENCES` on web, `BREAK_CADENCES` on mobile) because `breakCadenceMinutesSchema` has no `.options`; the mobile `SegmentedControl` requires string option values, so cadence is stringified at the boundary and cast back to `BreakCadenceMinutes` on change. i18n key set is identical under `web.reminders.*` and `mobile.reminders.*`.

**Placeholder scan:** The one deliberate placeholder is the mobile error-line `style={{ color: undefined }}`, called out in Task 6 Step 1 with the exact replacement (`colors.danger`, imported like `feedback.tsx`). No other TBDs.
