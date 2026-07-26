/**
 * Client-side UUID v4.
 *
 * Lives here rather than in `src/mocks/db`, which is where it used to be: that
 * module calls `seed()` at module scope, so importing a single helper from it
 * pulled the entire fixture catalog — and its seeding side effect — into the
 * production bundle for every browser, mocks enabled or not.
 */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}
