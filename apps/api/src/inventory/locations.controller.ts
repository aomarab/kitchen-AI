import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  createStorageLocationRequestSchema,
  uuidSchema,
  type CreateStorageLocationRequest,
  type StorageLocation,
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

  @Delete(':id')
  async delete(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
  ): Promise<{ ok: true }> {
    await this.locations.delete(household.id, id);
    return { ok: true };
  }
}
