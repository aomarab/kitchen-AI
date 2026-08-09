import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LocaleProvider } from '../../lib/locale';
import { PantryRailView } from './PantryRailView';

function renderRail() {
  return render(
    <LocaleProvider locale="en">
      <PantryRailView
        coveredCount={2}
        totalCount={3}
        inStock={[
          { id: 'i1', name: 'Onion' },
          { id: 'i2', name: 'Garlic' },
        ]}
        missing={[{ id: 'm1', name: 'Beef' }]}
        onAddAll={() => {}}
      />
    </LocaleProvider>,
  );
}

describe('PantryRailView', () => {
  it('separates in-stock ingredients from missing ones', () => {
    const { container } = renderRail();
    const lists = container.querySelectorAll('ul');
    const [inStockList, missingList] = Array.from(lists);

    // In-stock group holds what the kitchen already covers.
    expect(within(inStockList).getByText('Onion')).toBeInTheDocument();
    expect(within(inStockList).getByText('Garlic')).toBeInTheDocument();
    expect(within(inStockList).queryByText('Beef')).not.toBeInTheDocument();

    // Missing group holds only the shortfall the user must buy.
    expect(within(missingList).getByText('Beef')).toBeInTheDocument();
    expect(within(missingList).queryByText('Onion')).not.toBeInTheDocument();
  });

  it('offers to add the missing items to the shopping list only when something is missing', () => {
    renderRail();
    expect(screen.getByRole('button', { name: 'Add everything to shopping' })).toBeInTheDocument();
  });

  it('hides the add-all action when nothing is missing', () => {
    render(
      <LocaleProvider locale="en">
        <PantryRailView coveredCount={3} totalCount={3} inStock={[{ id: 'i1', name: 'Onion' }]} missing={[]} onAddAll={() => {}} />
      </LocaleProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Add everything to shopping' })).not.toBeInTheDocument();
    expect(screen.getByText('Nothing missing — you can cook the whole plan.')).toBeInTheDocument();
  });
});
