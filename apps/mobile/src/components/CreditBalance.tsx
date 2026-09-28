import { BalanceTile, type BalanceTileProps } from '../features/credits/BalanceTile';

export type CreditBalanceProps = BalanceTileProps;

/** Backward-compatible alias for the shared credits balance tile. */
export function CreditBalance(props: CreditBalanceProps) {
  return <BalanceTile {...props} />;
}
