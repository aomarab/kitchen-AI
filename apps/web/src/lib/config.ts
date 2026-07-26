/**
 * Runtime configuration for the web app.
 *
 * The API client talks to `API_URL`. In development and tests that URL is
 * served entirely by the MSW mocks in `src/mocks` (see spec §11 — web develops
 * against a contract-generated mock server, not the real API).
 *
 * Swapping to the real API at integration is a one-line change: set
 * `NEXT_PUBLIC_API_MOCK=false` (and point `NEXT_PUBLIC_API_URL` at the API).
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333').replace(
  /\/+$/,
  '',
);

/** Whether the MSW mock layer is active. Off means the real API is used. */
export const MOCKING_ENABLED = process.env.NEXT_PUBLIC_API_MOCK !== 'false';
