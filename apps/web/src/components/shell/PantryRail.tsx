'use client';

import { useMemo } from 'react';
import { formatNumber } from '@kitchen/i18n';
import { unitKey } from '../../lib/labels';
import { useLocale } from '../../lib/locale';
import { localizedName } from '../../lib/name';
import { usePlan, usePlanCoverage } from '../../hooks/plans';
import { useInventory } from '../../hooks/inventory';
import { useAddShoppingItems } from '../../hooks/shopping';
import { PantryRailView, type RailEntry } from './PantryRailView';
import { LoadingState, ErrorState } from '../ui/states';

/**
 * Data container for the pantry rail. Joins plan coverage with inventory so the
 * rail can show, for a given plan, what is drawn from the kitchen (prioritising
 * items expiring soon) and what still needs buying.
 */
export function PantryRail({ planId }: { planId: string | undefined }) {
  const { locale, t } = useLocale();
  const coverageQuery = usePlanCoverage(planId);
  const planQuery = usePlan(planId);
  const inventoryQuery = useInventory({ limit: 100, sort: 'expiry' });
  const addAll = useAddShoppingItems();

  const view = useMemo(() => {
    const coverage = coverageQuery.data;
    if (!coverage) return null;

    const items = inventoryQuery.data?.items ?? [];
    const byIngredient = new Map(items.map((it) => [it.ingredient.id, it]));

    const inStock: RailEntry[] = coverage.expiringSoonIngredientIds
      .map((id) => byIngredient.get(id))
      .filter((it): it is NonNullable<typeof it> => Boolean(it))
      .map((it) => ({
        id: it.id,
        name: localizedName(locale, {
          en: it.label ?? it.ingredient.canonicalNameEn,
          ar: it.label ?? it.ingredient.canonicalNameAr,
        }),
      }));

    const missing: RailEntry[] = coverage.shortfalls.map((s) => ({
      id: s.ingredientId,
      name: localizedName(locale, { en: s.nameEn, ar: s.nameAr }),
      detail: `${formatNumber(locale, s.shortfall)} ${t(unitKey(s.unit))}`,
    }));

    const covered = coverage.coveredEntryIds.length;
    const total = covered + coverage.uncoveredEntryIds.length;

    return { inStock, missing, covered, total, coverage };
  }, [coverageQuery.data, inventoryQuery.data, locale]);

  if (!planId) return null;

  if (coverageQuery.isError) {
    return (
      <div className="rounded-2xl border border-border bg-background p-4">
        <ErrorState error={coverageQuery.error} onRetry={() => void coverageQuery.refetch()} />
      </div>
    );
  }

  if (!view || planQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background">
        <LoadingState />
      </div>
    );
  }

  return (
    <PantryRailView
      coveredCount={view.covered}
      totalCount={view.total}
      inStock={view.inStock}
      missing={view.missing}
      addAllPending={addAll.isPending}
      onAddAll={() =>
        addAll.mutate({
          planId,
          items: view.coverage.shortfalls.map((s) => ({
            ingredientId: s.ingredientId,
            quantity: s.shortfall,
            unit: s.unit,
          })),
        })
      }
    />
  );
}
