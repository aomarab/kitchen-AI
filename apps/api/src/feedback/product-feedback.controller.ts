import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  listProductCommentsQuerySchema,
  listProductFeedbackQuerySchema,
  submitProductFeedbackRequestSchema,
  uuidSchema,
  type ListProductCommentsQuery,
  type ListProductFeedbackQuery,
  type ProductComment,
  type ProductFeedback,
  type ProductFeedbackRow,
  type ProductFeedbackSummary,
  type SubmitProductFeedbackRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { StaffGuard } from '../common/staff.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser, HouseholdContext } from '../common/request-context.js';
import type { Page } from '../common/pagination.js';
import { ProductFeedbackService } from './product-feedback.service.js';

/**
 * Reviewing a product you own.
 *
 * Nested under the inventory item on purpose: the item is what identifies the
 * product, and household scoping is what stops one customer attaching a
 * one-star review to a brand they have never bought.
 */
@Controller('inventory/items/:id/feedback')
@UseGuards(AuthGuard, HouseholdGuard)
export class ProductFeedbackController {
  constructor(@Inject(ProductFeedbackService) private readonly service: ProductFeedbackService) {}

  @Post()
  submit(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Body(new ZodPipe(submitProductFeedbackRequestSchema)) body: SubmitProductFeedbackRequest,
  ): Promise<ProductFeedback> {
    return this.service.submit(household.id, user.userId, id, body);
  }

  @Get()
  get(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
  ): Promise<ProductFeedbackSummary> {
    return this.service.forItem(household.id, user.userId, id);
  }
}

/**
 * The vendor report. `StaffGuard` is the security boundary — the web `AdminGate`
 * only hides the UI. Guard order matters: `AuthGuard` must populate
 * `request.authUser` before `StaffGuard` reads the role.
 */
@Controller('admin/product-feedback')
@UseGuards(AuthGuard, StaffGuard)
export class AdminProductFeedbackController {
  constructor(@Inject(ProductFeedbackService) private readonly service: ProductFeedbackService) {}

  // Declared before the collection route's siblings so Express matches the
  // literal segment rather than treating it as a parameter.
  @Get('comments')
  comments(
    @Query(new ZodPipe(listProductCommentsQuerySchema)) query: ListProductCommentsQuery,
  ): Promise<Page<ProductComment>> {
    return this.service.comments(query);
  }

  @Get()
  list(
    @Query(new ZodPipe(listProductFeedbackQuerySchema)) query: ListProductFeedbackQuery,
  ): Promise<Page<ProductFeedbackRow>> {
    return this.service.list(query);
  }
}
