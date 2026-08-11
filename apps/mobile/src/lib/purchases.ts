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
};

/**
 * Real RevenueCat purchase.
 *
 * `react-native-purchases` is a native module that is absent from Expo Go and
 * would crash the app on startup if imported eagerly, so it is pulled in with a
 * dynamic `import()` **inside this function body** — reached only when mocks are
 * off. Nothing at module scope references it. See the plan's Expo Go constraint.
 */
export const nativePurchases: PurchasesPort = {
  async purchase(productId: string): Promise<PurchaseResult> {
    const { default: Purchases } = await import('react-native-purchases');

    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
    if (apiKey && !(await Purchases.isConfigured())) {
      Purchases.configure({ apiKey });
    }

    const offerings = await Purchases.getOfferings();
    const pkg = Object.values(offerings.all)
      .flatMap((offering) => offering.availablePackages)
      .find((candidate) => candidate.product.identifier === productId);
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
};

const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

/**
 * The port the app uses. Mocks are the default (matching `lib/api.ts`), so a
 * fresh checkout buys credits with the fake and never touches the native SDK.
 */
export const purchases: PurchasesPort = USE_MOCKS ? mockPurchases : nativePurchases;
