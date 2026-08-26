import { Platform } from 'react-native';

/**
 * Store the receipt came from. Mirrors the contract's `confirmPurchase` `store`
 * enum so the outcome flows straight into the API call.
 */
export type Store = 'apple' | 'google';

export interface StorePurchase {
  storeTransactionId: string;
  store: Store;
}

/** A finished store interaction: a receipt, or the user backing out of the sheet. */
export type PurchaseResult = StorePurchase | { cancelled: true };

/**
 * Port for the platform in-app-purchase SDK, so the buy flow is testable in
 * node and the app never has to touch a native module in mock mode — the same
 * shape as the API's `PAYMENT_VERIFIER` behind `PAYMENTS_MOCK`.
 */
export interface PurchasesPort {
  purchase(productId: string): Promise<PurchaseResult>;
  /**
   * The store's own price for a product, already localized to the user's
   * storefront currency and formatting, or `null` when there is no store price
   * to show (mock mode, offline, or the product is missing from the offering).
   * The string is returned exactly as the store gives it and must be shown
   * verbatim — the whole point is that the storefront, not the app, decides the
   * currency and the amount.
   */
  getPrice(productId: string): Promise<string | null>;
}

export function isCancelled(result: PurchaseResult): result is { cancelled: true } {
  return 'cancelled' in result;
}

/** Apple on iOS, Google everywhere else — the two stores the contract accepts. */
export function activeStore(): Store {
  return Platform.OS === 'android' ? 'google' : 'apple';
}

/**
 * Offline fake. Returns a deterministic-shaped receipt without ever loading the
 * native SDK, so the whole purchase path runs in Expo Go and in the Simulator
 * (where StoreKit does not work at all) and in node tests.
 */
export const mockPurchases: PurchasesPort = {
  async purchase(productId: string): Promise<PurchaseResult> {
    return { storeTransactionId: `mock-txn-${productId}-${Date.now()}`, store: activeStore() };
  },
  /**
   * There is no real storefront offline, so the mock reports "no store price".
   * The screen then shows the contract's `priceUsd` formatted for the active
   * locale, which is exactly the pre-store display — and keeps this path off the
   * native SDK so it runs in Expo Go, the Simulator and node tests.
   */
  async getPrice(): Promise<string | null> {
    return null;
  },
};

/**
 * Loads the RevenueCat SDK and resolves the offering package for a product.
 *
 * `react-native-purchases` is a native module that is absent from Expo Go and
 * would crash the app on startup if imported eagerly, so it is pulled in with a
 * dynamic `import()` **inside this function body** — reached only when mocks are
 * off. Nothing at module scope references it (not even its types). See the
 * plan's Expo Go constraint.
 */
async function loadPackage(productId: string) {
  const { default: Purchases } = await import('react-native-purchases');

  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
  if (apiKey && !(await Purchases.isConfigured())) {
    Purchases.configure({ apiKey });
  }

  const offerings = await Purchases.getOfferings();
  const pkg = Object.values(offerings.all)
    .flatMap((offering) => offering.availablePackages)
    .find((candidate) => candidate.product.identifier === productId);
  return { Purchases, pkg };
}

/** Real RevenueCat adapter — reached only when mocks are off. */
export const nativePurchases: PurchasesPort = {
  async purchase(productId: string): Promise<PurchaseResult> {
    const { Purchases, pkg } = await loadPackage(productId);
    if (!pkg) {
      throw new Error(`No store package configured for product ${productId}`);
    }

    try {
      const { transaction } = await Purchases.purchasePackage(pkg);
      return { storeTransactionId: transaction?.transactionIdentifier ?? '', store: activeStore() };
    } catch (error) {
      if ((error as { userCancelled?: boolean }).userCancelled) return { cancelled: true };
      throw error;
    }
  },

  async getPrice(productId: string): Promise<string | null> {
    const { pkg } = await loadPackage(productId);
    // `priceString` is already localized to the storefront currency and
    // formatting (e.g. "٤٫٩٩ ر.س.‏", "£3.99"). Return it verbatim — never
    // reformat it, never run it through `Intl`, never parse a number out of it,
    // or the app would show a price that differs from what the store charges.
    return pkg?.product.priceString ?? null;
  },
};

const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

/**
 * The storefront is switched *separately* from the API mocks, because the two
 * do not become real at the same time. A build has to leave `EXPO_PUBLIC_USE_MOCKS`
 * off to do real OAuth against a real API, but there may still be no store to
 * buy from — no RevenueCat key, or a bundle id App Store Connect has never seen
 * — and then the native SDK cannot even load and every Buy tap fails.
 *
 * `EXPO_PUBLIC_USE_STORE_MOCKS` overrides; when it is unset the storefront
 * follows the API mocks, so existing builds behave exactly as before.
 */
const storeMockFlag = process.env.EXPO_PUBLIC_USE_STORE_MOCKS;
const USE_STORE_MOCKS =
  storeMockFlag === undefined || storeMockFlag === '' ? USE_MOCKS : storeMockFlag !== 'false';

/**
 * The port the app uses. Mocks are the default (matching `lib/api.ts`), so a
 * fresh checkout buys credits with the fake and never touches the native SDK.
 */
export const purchases: PurchasesPort = USE_STORE_MOCKS ? mockPurchases : nativePurchases;
