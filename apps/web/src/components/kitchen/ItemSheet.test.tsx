import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InventoryItem } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { ItemSheet } from './ItemSheet';

const { updateMutate, removeMutate } = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  removeMutate: vi.fn(),
}));

vi.mock('../../hooks/inventory', () => ({
  useUpdateInventoryItem: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteInventoryItem: () => ({ mutate: removeMutate, isPending: false }),
  useLocations: () => ({ data: [] }),
}));

function makeItem(id: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    householdId: 'h1',
    locationId: null,
    ingredient: {
      id: `ing-${id}`,
      canonicalNameEn: `Item ${id}`,
      canonicalNameAr: `صنف ${id}`,
      category: 'vegetable',
      defaultUnit: 'piece',
      shelfLifeDays: null,
    },
    quantity: 4,
    unit: 'piece',
    brand: null,
    expiresAt: '2026-08-01',
    source: 'manual',
    confidence: null,
    createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z',
    ...overrides,
  } as InventoryItem;
}

function renderSheet(item: InventoryItem | null) {
  return render(
    <LocaleProvider locale="en">
      <ItemSheet item={item} onClose={vi.fn()} />
    </LocaleProvider>,
  );
}

describe('ItemSheet', () => {
  beforeEach(() => {
    updateMutate.mockClear();
    removeMutate.mockClear();
  });

  it('shows the selected item’s current values', () => {
    renderSheet(makeItem('a'));

    expect(screen.getByLabelText<HTMLInputElement>(/quantity/i).value).toBe('4');
    expect(screen.getByLabelText<HTMLInputElement>(/expiry/i).value).toBe('2026-08-01');
  });

  /**
   * The sheet is rendered unconditionally by the kitchen view and only swaps
   * its `item` prop, so without a reset the component instance — and its draft
   * state — is shared between items.
   */
  it('does not carry an abandoned edit from one item onto the next', () => {
    const { rerender } = renderSheet(makeItem('a', { quantity: 4 }));

    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '99' } });

    rerender(
      <LocaleProvider locale="en">
        <ItemSheet item={makeItem('b', { quantity: 7 })} onClose={vi.fn()} />
      </LocaleProvider>,
    );

    expect(screen.getByLabelText<HTMLInputElement>(/quantity/i).value).toBe('7');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b', quantity: 7 }),
      expect.anything(),
    );
  });

  it('clears an expiry date instead of silently keeping the old one', () => {
    renderSheet(makeItem('a'));

    fireEvent.change(screen.getByLabelText(/expiry/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // `null` clears it server-side; `undefined` would mean "leave unchanged".
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: null }),
      expect.anything(),
    );
  });

  it('refuses to save an empty quantity rather than sending NaN', () => {
    renderSheet(makeItem('a'));

    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '' } });

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('shows a brand and lets an empty field clear one the lookup got wrong', () => {
    renderSheet(makeItem('a', { brand: 'Al Marai' }));

    expect(screen.getByLabelText<HTMLInputElement>(/brand/i).value).toBe('Al Marai');

    fireEvent.change(screen.getByLabelText(/brand/i), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ brand: null }),
      expect.anything(),
    );
  });

  /**
   * A brand is a proper noun in whatever script it was registered in, so an
   * Arabic brand shown in the English UI (or the reverse) must resolve its own
   * direction — otherwise punctuation and digits jump to the wrong end. It is
   * isolated rather than given `dir="auto"`, which would additionally flip the
   * paragraph's alignment and strand the brand at the opposite edge from the
   * name it sits under.
   */
  it('isolates a brand’s direction without flipping its alignment', () => {
    renderSheet(makeItem('a', { brand: 'المراعي' }));

    const shown = screen.getByText('المراعي');
    expect(shown.tagName).toBe('BDI');
    expect(shown.closest('p')).not.toHaveAttribute('dir');
    // The editable field is a different case: a text input should show the
    // typed value in its own direction, alignment included.
    expect(screen.getByLabelText(/brand/i)).toHaveAttribute('dir', 'auto');
  });

  it('renders nothing when no item is selected', () => {
    const { container } = renderSheet(null);
    expect(container).toBeEmptyDOMElement();
  });
});
