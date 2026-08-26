import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createStorageLocationRequestSchema,
  deleteStorageLocationQuerySchema,
  updateStorageLocationRequestSchema,
  uuidSchema,
  type CreateStorageLocationRequest,
  type DeleteStorageLocationQuery,
  type StorageLocation,
  type UpdateStorageLocationRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import type { HouseholdContext } from '../common/request-context.js';
import { LocationsService } from './locations.service.js';

@Controller('inventory/locations')
@UseGuards(AuthGuard, HouseholdGuard)
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Get()
  list(@CurrentHousehold() household: HouseholdContext): Promise<StorageLocation[]> {
    return this.locations.list(household.id);
  }

  @Post()
  create(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(createStorageLocationRequestSchema)) body: CreateStorageLocationRequest,
  ): Promise<StorageLocation> {
    return this.locations.create(household.id, body);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Body(new ZodPipe(updateStorageLocationRequestSchema)) body: UpdateStorageLocationRequest,
  ): Promise<StorageLocation> {
    return this.locations.update(household.id, id, body);
  }

  @Delete(':id')
  async delete(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Query(new ZodPipe(deleteStorageLocationQuerySchema)) query: DeleteStorageLocationQuery,
  ): Promise<{ ok: true }> {
    await this.locations.delete(household.id, id, query);
    return { ok: true };
  }
}
