import { Tile } from '../../components/Tile';
import { OrbMascot } from '../../components/OrbMascot';
import { useFormat } from '../../hooks/useFormat';
import { totalCredits, type BalanceLike } from '../../lib/credits';
import { formatQty } from '../../lib/format';

export const BALANCE_ORB_SIZE = 56;

export interface BalanceTileProps {
  balance: BalanceLike & { freeGrant: number };
}

/** Butter balance tile shared by the credit purchase and usage screens (spec §9.7). */
export function BalanceTile({ balance }: BalanceTileProps) {
  const { t, locale, prefs } = useFormat();
  const total = formatQty(locale, totalCredits(balance), prefs);
  const free = formatQty(locale, balance.freeBalance, prefs);
  const paid = formatQty(locale, balance.paidBalance, prefs);
  const grant = formatQty(locale, balance.freeGrant, prefs);
  const balanceLabel = t('mobile.credits.balanceLabel');
  const totalLine = t('mobile.credits.packCredits', { credits: total });
  const freeLine = `${t('mobile.credits.free')}: ${t('mobile.credits.packCredits', {
    credits: free,
  })}`;
  const paidLine = `${t('mobile.credits.paid')}: ${t('mobile.credits.packCredits', {
    credits: paid,
  })}`;
  const resetLine = t('mobile.credits.resets', { grant });

  return (
    <Tile
      tint="butter"
      leading={<OrbMascot size={BALANCE_ORB_SIZE} state="idle" accessible={false} />}
      count={total}
      caption={[balanceLabel, freeLine, paidLine, resetLine].join('\n')}
      accessibilityLabel={[`${balanceLabel}: ${totalLine}`, freeLine, paidLine, resetLine].join(
        '. ',
      )}
    />
  );
}
