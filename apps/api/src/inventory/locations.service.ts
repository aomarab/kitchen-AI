import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type {
  CreateStorageLocationRequest,
  StorageLocation,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { storageLocations } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { toStorageLocation } from './inventory.serializer.js';

@Injectable()
export class LocationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(householdId: string): Promise<StorageLocation[]> {
    const rows = await this.db
      .select()
      .from(storageLocations)
      .where(eq(storageLocations.householdId, householdId))
      .orderBy(storageLocations.name);
    return rows.map(toStorageLocation);
  }

  async create(
    householdId: string,
    dto: CreateStorageLocationRequest,
  ): Promise<StorageLocation> {
    const [row] = await this.db
      .insert(storageLocations)
      .values({ householdId, name: dto.name, type: dto.type })
      .returning();
    if (!row) throw new AppError('INTERNAL_ERROR');
    return toStorageLocation(row);
  }

  async delete(householdId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(storageLocations)
      .where(and(eq(storageLocations.id, id), eq(storageLocations.householdId, householdId)))
      .returning({ id: storageLocations.id });
    if (!row) throw AppError.notFound();
  }
}
