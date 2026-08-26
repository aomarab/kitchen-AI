import { useQuery } from '@tanstack/react-query';
import { CREDIT_PACKS } from '@kitchen/contracts';
import { api } from '../lib/api';
import { purchases } from '../lib/purchases';
import { qk } from './keys';

/** The household's credit balance — free grant plus purchased (spec §7). */
export function useCredits() {
  return useQuery({ queryKey: qk.credits, queryFn: () => api.call('getCredits') });
}

/**
 * The stores' own localized prices for the credit packs, keyed by product id.
 * A `null` value means the store had no price to give (mock mode, offline, or
 * the product is missing from the offering); the screen then falls back to the
 * contract price. Never touches the native SDK in mock mode — `getPrice` on the
 * mock resolves offline.
 */
export function usePackPrices() {
  return useQuery({
    queryKey: qk.creditPackPrices,
    queryFn: async () => {
      const entries = await Promise.all(
        CREDIT_PACKS.map(
          async (pack) => [pack.productId, await purchases.getPrice(pack.productId)] as const,
        ),
      );
      return Object.fromEntries(entries) as Record<string, string | null>;
    },
    staleTime: Infinity,
  });
}
