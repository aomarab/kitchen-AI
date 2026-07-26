import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  bulkCreateInventoryRequestSchema,
  listInventoryQuerySchema,
  syncEventsRequestSchema,
  updateInventoryItemRequestSchema,
  uuidSchema,
  type BulkCreateInventoryRequest,
  type InventoryEvent,
  type InventoryItem,
  type ListInventoryQuery,
  type SyncEventsRequest,
  type SyncEventsResponse,
  type UpdateInventoryItemRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser, HouseholdContext } from '../common/request-context.js';
import type { Page } from '../common/pagination.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
@UseGuards(AuthGuard, HouseholdGuard)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get('items')
  list(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(listInventoryQuerySchema)) query: ListInventoryQuery,
  ): Promise<Page<InventoryItem>> {
    return this.inventory.list(household.id, query);
  }

  @Post('items:bulk')
  bulkCreate(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(bulkCreateInventoryRequestSchema)) body: BulkCreateInventoryRequest,
  ): Promise<InventoryItem[]> {
    return this.inventory.bulkCreate(household.id, user.userId, body);
  }

  @Patch('items/:id')
  update(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Body(new ZodPipe(updateInventoryItemRequestSchema)) body: UpdateInventoryItemRequest,
  ): Promise<InventoryItem> {
    return this.inventory.update(household.id, user.userId, id, body);
  }

  @Delete('items/:id')
  async delete(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
  ): Promise<{ ok: true }> {
    await this.inventory.delete(household.id, id);
    return { ok: true };
  }

  @Get('events')
  listEvents(@CurrentHousehold() household: HouseholdContext): Promise<InventoryEvent[]> {
    return this.inventory.listEvents(household.id);
  }

  @Post('events:sync')
  sync(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(syncEventsRequestSchema)) body: SyncEventsRequest,
  ): Promise<SyncEventsResponse> {
    return this.inventory.sync(household.id, user.userId, body.events);
  }
}
