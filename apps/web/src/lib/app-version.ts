/**
 * Web has no Expo config to read a version from. `NEXT_PUBLIC_APP_VERSION` is
 * injected at build time by CI; the fallback keeps local development and the
 * mock-only mode submitting rather than failing validation.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-dev';
