import { describe, expect, it } from 'vitest';
import type { StorageLocation } from '@kitchen/contracts';
import { countByLocation, planLocationRemoval } from './places';

function place(id: string, name = 'Shelf'): StorageLocation {
  return { id, householdId: 'h', name, type: 'other' };
}

const fridge = place('1', 'Fridge');
const freezer = place('2', 'Freezer');
const pantry = place('3', 'Pantry');

describe('planLocationRemoval', () => {
  it('removes an empty place without asking anything', () => {
    expect(planLocationRemoval(fridge, 0, [fridge, freezer])).toEqual({ action: 'delete' });
  });

  it('asks where the food should go when the place is not empty', () => {
    const plan = planLocationRemoval(fridge, 4, [fridge, freezer, pantry]);
    expect(plan).toEqual({
      action: 'choose-destination',
      destinations: [freezer, pantry],
      itemCount: 4,
    });
  });

  it('never offers the place being removed as its own destination', () => {
    const plan = planLocationRemoval(freezer, 2, [fridge, freezer, pantry]);
    if (plan.action !== 'choose-destination') throw new Error('expected a destination choice');
    expect(plan.destinations.map((d) => d.id)).not.toContain(freezer.id);
  });

  it('blocks removing the only place, even when it is empty', () => {
    // Every item needs a locationId, so a household with no places cannot
    // store anything — an empty last shelf is still the only shelf.
    expect(planLocationRemoval(fridge, 0, [fridge])).toEqual({
      action: 'blocked',
      reason: 'only-place',
    });
  });

  it('blocks removing the only place when it holds food', () => {
    expect(planLocationRemoval(fridge, 9, [fridge])).toEqual({
      action: 'blocked',
      reason: 'only-place',
    });
  });
});

describe('countByLocation', () => {
  it('counts the items in each place', () => {
    const counts = countByLocation([
      { locationId: '1' },
      { locationId: '1' },
      { locationId: '2' },
    ]);
    expect(counts.get('1')).toBe(2);
    expect(counts.get('2')).toBe(1);
  });

  it('reports nothing for a place holding nothing', () => {
    expect(countByLocation([{ locationId: '1' }]).get('2')).toBeUndefined();
  });
});
