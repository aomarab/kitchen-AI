import type { StorageLocation } from '@kitchen/contracts';

export type RemovalPlan =
  /** Nothing is stored here, so removing it costs nothing. */
  | { action: 'delete' }
  /** Food lives here; the user has to say where it goes first. */
  | { action: 'choose-destination'; destinations: StorageLocation[]; itemCount: number }
  /** The last remaining place, or the only one that could receive the contents. */
  | { action: 'blocked'; reason: 'only-place' };

/**
 * What pressing "remove" on a kitchen place should do.
 *
 * Kept out of the screen because it is the part with consequences: the API
 * refuses to delete a place that still holds food (it used to cascade and
 * destroy it), and this is the decision that turns that refusal into a
 * question the user can answer.
 *
 * Blocking on the last place is not defensiveness. Every item needs a
 * `locationId`, so a household with no places cannot store anything at all,
 * and there would be nowhere to move the contents to either.
 */
export function planLocationRemoval(
  place: StorageLocation,
  itemCount: number,
  allPlaces: readonly StorageLocation[],
): RemovalPlan {
  const destinations = allPlaces.filter((candidate) => candidate.id !== place.id);
  if (destinations.length === 0) return { action: 'blocked', reason: 'only-place' };
  if (itemCount === 0) return { action: 'delete' };
  return { action: 'choose-destination', destinations, itemCount };
}

/** Items per place, for the counts the remove decision depends on. */
export function countByLocation(
  items: readonly { locationId: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.locationId, (counts.get(item.locationId) ?? 0) + 1);
  }
  return counts;
}
