import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  addShoppingItemsRequestSchema,
  checkoutShoppingRequestSchema,
  toggleShoppingItemRequestSchema,
  type AddShoppingItemsRequest,
  type CheckoutShoppingRequest,
  type InventoryItem,
  type ShoppingListItem,
  type ToggleShoppingItemRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../../common/http.js';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import { CurrentHousehold } from '../../common/current-household.decorator.js';
import type { HouseholdContext } from '../../common/request-context.js';
import { ShoppingService } from './shopping.service.js';

/** Shopping-list endpoints (spec §5.4 Stage C, §4.2 checkout). */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class ShoppingController {
  constructor(@Inject(ShoppingService) private readonly shopping: ShoppingService) {}

  @Get('shopping-list')
  list(@CurrentHousehold() household: HouseholdContext): Promise<ShoppingListItem[]> {
    return this.shopping.list(household.id);
  }

  @Post('shopping-list')
  add(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(addShoppingItemsRequestSchema)) body: AddShoppingItemsRequest,
  ): Promise<ShoppingListItem[]> {
    return this.shopping.add(household.id, body);
  }

  @Patch('shopping-list/:id')
  toggle(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id') id: string,
    @Body(new ZodPipe(toggleShoppingItemRequestSchema)) body: ToggleShoppingItemRequest,
  ): Promise<ShoppingListItem> {
    return this.shopping.toggle(household.id, id, body);
  }

  @Post('shopping-list/checkout')
  checkout(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(checkoutShoppingRequestSchema)) body: CheckoutShoppingRequest,
  ): Promise<InventoryItem[]> {
    return this.shopping.checkout(household.id, body);
  }
}
