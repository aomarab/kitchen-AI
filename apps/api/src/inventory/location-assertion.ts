import { and, eq } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import { storageLocations } from '../db/schema.js';
import type { Database } from '../db/index.js';

export type InventoryTx = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function assertStorageLocation(
  tx: InventoryTx,
  householdId: string,
  locationId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: storageLocations.id })
    .from(storageLocations)
    .where(and(eq(storageLocations.id, locationId), eq(storageLocations.householdId, householdId)))
    .limit(1);
  if (!row) throw AppError.notFound();
}
