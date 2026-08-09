/**
 * Runtime configuration for the web app.
 *
 * The API client talks to `API_URL`. In development and tests that URL is
 * served entirely by the MSW mocks in `src/mocks` (see spec §11 — web develops
 * against a contract-generated mock server, not the real API).
 *
 * Swapping to the real API at integration is a one-line change: drop
 * `NEXT_PUBLIC_API_MOCK` (and point `NEXT_PUBLIC_API_URL` at the API).
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333').replace(
  /\/+$/,
  '',
);

/**
 * Whether the MSW mock layer is active.
 *
 * Fails closed: mocking is opt-in via `NEXT_PUBLIC_API_MOCK=true`, and is
 * refused outright in a production build. `NEXT_PUBLIC_*` is inlined at build
 * time, so an opt-out default would mean a build that simply forgot the
 * variable ships the entire app backed by fixtures — where `/auth/login`
 * accepts any email and password.
 */
export const MOCKING_ENABLED =
  process.env.NEXT_PUBLIC_API_MOCK === 'true' && process.env.NODE_ENV !== 'production';
