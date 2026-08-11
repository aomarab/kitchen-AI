import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import {
  confirmPurchaseRequestSchema,
  purchaseIntentRequestSchema,
  type ConfirmPurchaseRequest,
  type CreditBalance,
  type PurchaseIntent,
  type PurchaseIntentRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import type { AuthUser, HouseholdContext } from '../common/request-context.js';
import { CreditsService } from './credits.service.js';
import { PurchaseService } from './purchase.service.js';

/** Household credit balance and purchases (spec §5, §6). */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class CreditsController {
  constructor(
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(PurchaseService) private readonly purchases: PurchaseService,
  ) {}

  @Get('credits')
  balance(@CurrentHousehold() household: HouseholdContext): Promise<CreditBalance> {
    return this.credits.balance(household.id);
  }

  @Post('credits/intents')
  createIntent(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(purchaseIntentRequestSchema)) body: PurchaseIntentRequest,
  ): Promise<PurchaseIntent> {
    return this.purchases.createIntent(household.id, user.userId, body.productId);
  }

  @Post('credits/purchases')
  confirm(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(confirmPurchaseRequestSchema))
    body: ConfirmPurchaseRequest,
  ): Promise<CreditBalance> {
    return this.purchases.confirm(household.id, body);
  }
}
