import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecognizedItem, StorageLocation } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { ReviewList } from './ReviewList';

const mutate = vi.fn();

vi.mock('../../hooks/capture', () => ({
  useBulkCreateInventory: () => ({ mutate, isPending: false }),
}));

const locations: StorageLocation[] = [
  { id: 'a1111111-1111-4111-8111-111111111111', householdId: 'h', name: 'Fridge', type: 'fridge' },
  { id: 'a2222222-2222-4222-8222-222222222222', householdId: 'h', name: 'Pantry', type: 'pantry' },
];

const items: RecognizedItem[] = [
  {
    tempId: 't1',
    match: { ingredientId: 'b1111111-1111-4111-8111-111111111111', strategy: 'exact', confidence: 0.95, rawName: 'onion' },
    nameEn: 'Onion',
    nameAr: 'بصل',
    category: 'vegetable',
    quantity: 3,
    unit: 'piece',
    confidence: 0.95,
    suggestedExpiresAt: null,
    suggestedLocationType: 'pantry',
    photoKey: null,
  },
  {
    tempId: 't2',
    match: { ingredientId: null, strategy: 'unresolved', confidence: 0.3, rawName: 'mystery' },
    nameEn: 'Mystery leaf',
    nameAr: 'ورقة غامضة',
    category: 'vegetable',
    quantity: 1,
    unit: 'bunch',
    confidence: 0.3,
    suggestedExpiresAt: null,
    suggestedLocationType: 'fridge',
    photoKey: null,
  },
];

function renderReview() {
  return render(
    <LocaleProvider locale="en">
      <ReviewList items={items} locations={locations} source="photo" onDone={vi.fn()} />
    </LocaleProvider>,
  );
}

describe('ReviewList (AI review)', () => {
  beforeEach(() => mutate.mockClear());

  it('does not commit anything to inventory on mount', () => {
    renderReview();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('flags low-confidence rows for a second look', () => {
    renderReview();
    // One of the two rows is below the low-confidence threshold.
    expect(screen.getByText(/Low confidence/)).toBeInTheDocument();
  });

  it('only commits after the user explicitly confirms', () => {
    renderReview();

    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add all to kitchen' }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
