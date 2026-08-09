import type { Locale } from '@kitchen/contracts';

/**
 * The locale the mock server should render domain content in. The real API
 * infers this from the request; our client can't add a header without touching
 * `@kitchen/api-client`, so the `MswProvider` mirrors the active UI locale here.
 * Requests that carry an explicit locale (recipe fetch, plan generation) still
 * win over this fallback.
 */
let currentLocale: Locale = 'en';

export function setMockLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getMockLocale(): Locale {
  return currentLocale;
}
