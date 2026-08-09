# Product feedback and admin console — design

Date: 2026-08-09
Status: approved
Scope: sub-project 1 of 4 (see [Decomposition](#decomposition))

## Problem

Kitchen AI has no way for a user to tell us anything, and no way for us to read
it if they did. Before publishing to the App Store and Google Play we want a
first-party feedback channel and an internal surface to triage what arrives.

## Decomposition

The original request covered five things. Feedback and the dashboard are
useless apart, so they form one sub-project; the rest are specced separately.

| #     | Sub-project                     | Notes                                                                               |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------- |
| **1** | **Feedback + admin console**    | This document.                                                                        |
| 2     | Publishing compliance           | Account deletion is a hard blocker (Apple 5.1.1(v), Google Play). Privacy label, Data Safety form, age rating. |
| 3     | Device compatibility            | Tablets, Dynamic Type, edge-to-edge, safe areas. Today the app is portrait-only with `supportsTablet: true` and untested. |
| 4     | Brand/vendor on items           | `brand` already flows Open Food Facts → barcode service → contract but is never persisted. One column plus display. |

Sub-projects 2–4 each get their own spec.

### Deferred deliberately

- Grocery-item reviews and AI thumbs up/down. Both are wanted eventually. Item
  reviews are user-visible content and drag in Apple Guideline 1.2 obligations
  (filtering, reporting, blocking, published contact) — a cost to budget when
  that sub-project is specced, not now.
- Replies to feedback. v1 is triage-only: status plus internal notes, nothing
  goes back to the user. No threads, no push notifications.
- A UI for promoting staff. Role changes happen by SQL.

## Data model

```sql
user_role        : 'user' | 'staff'
feedback_status  : 'new' | 'triaged' | 'resolved' | 'wont_fix'
feedback_platform: 'ios' | 'android' | 'web'
```

`users.role` is `user_role NOT NULL DEFAULT 'user'`.

```
feedback
  id           uuid pk
  user_id      uuid not null → users(id) ON DELETE CASCADE
  rating       smallint not null          -- CHECK (rating BETWEEN 1 AND 5)
  message      text                       -- nullable, ≤2000 chars (zod)
  platform     feedback_platform not null
  app_version  text not null
  locale       locale not null
  status       feedback_status not null default 'new'
  admin_note   text
  reviewed_by  uuid → users(id) ON DELETE SET NULL
  reviewed_at  timestamptz
  created_at   timestamptz not null default now()

  index (status, created_at DESC)
  index (created_at DESC)
```

Schema changes go in `apps/api/src/db/schema.ts` followed by `pnpm db:generate`;
the generated SQL in `apps/api/drizzle/` is committed. No hand-written migration.

### Decisions

**`ON DELETE CASCADE` on `user_id`.** Feedback dies with the account. Sub-project
2 introduces account deletion, and this keeps a single deletion path that erases
everything. The cost is losing that user's report. `SET NULL` was rejected: it
preserves aggregates but retains free text a user has asked us to erase.

**`platform`, `app_version` and `locale` are attached automatically.** A 2★
rating with no app version is unactionable. None of the three is a device
identifier, and feedback is already tied to a signed-in user, so no new privacy
category appears in the store disclosures.

**No `household_id`.** Feedback is an act by a user, not household data. This is
a deliberate exception to "households own data"; the route is `auth: true,
household: false`, which the registry already supports (`listHouseholds` does the
same).

**Staff promotion by SQL only.** No route and no UI sets `users.role`. This
removes a privilege-escalation surface at zero cost.

## Authorization

Staff routes are declared in the contract registry, not just guarded in a
controller. `packages/contracts/src/routes.ts` gains one optional field:

```ts
staff?: boolean;
```

The API applies `StaffGuard` (a sibling of the existing `AuthGuard` and
`HouseholdGuard` in `apps/api/src/common/`), which reads `users.role` and throws
`AppError` with an `errors.*` message key on failure.

The enforcement that matters is a **behavioural sweep test**: it iterates
`routes`, selects every entry with `staff === true`, issues a real request with
an ordinary non-staff token, and asserts `403`. A new admin route that forgets
`StaffGuard` fails the suite as soon as it is added. This is stronger than
reflecting decorator metadata, because it tests the running stack, and it
follows the existing self-enforcing pattern of `mocks/coverage.spec.ts` and the
palette guards.

`AdminGate` on the web client is **not** a security boundary. It hides the UI and
redirects non-staff for UX reasons only. In an app that can run entirely against
MSW mocks, a client-side gate controls nothing; `StaffGuard` does.

## API surface

| Route                 | Method | Path                 | Auth         |
| --------------------- | ------ | -------------------- | ------------ |
| `submitFeedback`      | POST   | `/feedback`          | auth         |
| `adminListFeedback`   | GET    | `/admin/feedback`    | auth + staff |
| `adminGetFeedback`    | GET    | `/admin/feedback/:id`| auth + staff |
| `adminUpdateFeedback` | PATCH  | `/admin/feedback/:id`| auth + staff |
| `adminFeedbackStats`  | GET    | `/admin/feedback/stats` | auth + staff |

- `submitFeedback` body: `rating` (1–5), optional `message` (≤2000), `platform`,
  `appVersion`, `locale`. The client sends the last three because it knows the
  truth; the server validates them against the enums. `rating` is required and
  `message` is optional; a rating with no message is valid, a message with no
  rating is not. The response is the created record's `id` and `createdAt` only —
  the client needs nothing else, since there is no "my feedback" view.
- `adminListFeedback` query: optional `status`, `rating`, `platform`, plus
  `limit` and `cursor`. Responds with `items` and `nextCursor`.
- `adminGetFeedback` includes the submitter's email, locale and join date — the
  agreed limit of customer data exposed to staff. It does **not** expose
  household inventory or meal plans.
- `adminUpdateFeedback` body: optional `status` and `adminNote`; stamps
  `reviewed_by` and `reviewed_at`. Any status may be set from any other — there
  is no state machine and no forbidden transition.
- `adminFeedbackStats`: total, average rating, counts by status and by rating.

Validation uses `@Body(new ZodPipe(schema))` with the contract schema, per
existing convention. Drizzle `numeric` and timestamp values are converted
through `common/serialization.ts` rather than cast inline.

`@kitchen/api-client` derives its typed `call()` from the registry automatically.
Both MSW layers need resolvers for the new routes or `mocks/coverage.spec.ts`
fails.

### Abuse control

No throttler package is installed and this does not justify adding one.
`submitFeedback` counts the caller's rows from the last 24 hours and rejects the
sixth with `AppError` carrying `errors.feedbackRateLimited`. As everywhere else,
the server sends no user-facing prose — the client translates the key.

## UI

### Submission

A "Send feedback" row in the existing settings surfaces opens a dedicated form
screen: five star buttons, an optional multiline message, submit, confirmation.

- mobile: a new `apps/mobile/src/app/settings/feedback.tsx`, linked from
  `apps/mobile/src/app/settings/index.tsx`
- web: a new `feedback` page under the existing `(app)/settings` route, linked
  from the settings page

Each star is a real button with its own accessibility label and a ≥44×44 touch
target. A star row implemented as taps on a single image is the standard
accessibility failure for this control and is not acceptable.

Everything is built from existing primitives (`Screen`, `Field`, `Button`,
`AppText` on mobile; the `ui` components on web). No new design tokens, no raw
hex, no physical-direction styles — the existing guard tests enforce all three.

### Admin console

A new `(admin)` route group in the web app, deliberately outside `(app)`: the
AppShell's sidebar and pantry rail are meaningless around a feedback table.

- `/admin` — stats strip (average rating, counts by status), filter chips for
  status/rating/platform, and a list showing stars, message excerpt, platform,
  date and status badge, with cursor pagination.
- `/admin/feedback/[id]` — full message, submitter details, status select,
  internal notes.

### Internationalisation

`packages/i18n/src/en.ts` is the source of truth and `ar.ts` is typed against it,
so a missing Arabic string is a build error. The roughly 25 new `web.admin.*`
keys therefore ship with Arabic translations even though the console is
internal-only. Carving out an exception was rejected: it would weaken a rule that
currently costs nothing to keep.

New keys go in `web.en.ts`/`web.ar.ts` (web-owned) and `mobile.en.ts`/
`mobile.ar.ts` (mobile-owned). Backend contributes `errors.*` keys only.

## Store policy

Consequences of this sub-project specifically:

- **Apple Guideline 1.2 does not apply to v1.** Nothing a user writes is visible
  to any other user, so the user-generated-content obligations — filtering,
  reporting, blocking, published contact — are not triggered. They will be
  triggered by grocery-item reviews later.
- **The in-app rating stays independent of the native review prompt.** This
  feature makes no `StoreReview` call. Using a collected rating to decide who
  sees the App Store or Play prompt is sentiment filtering, prohibited by Apple
  Guideline 1.1.7 and Google's In-App Review policy.
- **Declare in both consoles:** the feedback message as *User Content*, linked to
  the user through *Identifiers*. The privacy policy must also state that staff
  may access account information to handle support.
- **No tracking is introduced**, so no App Tracking Transparency prompt.

## Testing

API integration specs, using the live-Postgres harness in `src/testing/`:

- ratings of 0 and 6 are rejected; 1 and 5 are accepted
- a message over 2000 characters is rejected
- the sixth submission within 24 hours is rejected with the rate-limit code
- `adminUpdateFeedback` stamps `reviewed_by` and `reviewed_at`
- list filters and cursor pagination return the expected pages
- the staff sweep: every `staff: true` route answers 403 to an ordinary token

Web component tests (jsdom, MSW): the star input is keyboard-operable and
labelled, `AdminGate` redirects a non-staff user, the detail view saves status
and note.

Mobile keeps its logic-only topology — no render harness exists — so any
validation or mapping logic lives in `src/lib` where it is testable.

The existing guard tests must stay green **without modification**: palette
contrast (web and mobile), token usage, typography, and MSW route coverage.

## Out of scope

Reply threads, push notifications, item reviews, AI feedback, a staff-management
UI, analytics dashboards beyond the feedback stats strip, and anything in
sub-projects 2–4.
