import { Body, Controller, Get, Inject, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  listFeedbackQuerySchema,
  updateFeedbackRequestSchema,
  uuidSchema,
  type FeedbackDetail,
  type FeedbackStats,
  type FeedbackSummary,
  type ListFeedbackQuery,
  type UpdateFeedbackRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { StaffGuard } from '../common/staff.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser } from '../common/request-context.js';
import type { Page } from '../common/pagination.js';
import { AdminFeedbackService } from './admin-feedback.service.js';

/**
 * Staff-only triage surface. `StaffGuard` is the security boundary — the web
 * `AdminGate` only hides the UI. Guard order matters: `AuthGuard` must populate
 * `request.authUser` before `StaffGuard` reads the role.
 */
@Controller('admin/feedback')
@UseGuards(AuthGuard, StaffGuard)
export class AdminFeedbackController {
  constructor(@Inject(AdminFeedbackService) private readonly admin: AdminFeedbackService) {}

  // Declared before `:id` so Express does not match the literal as a param.
  @Get('stats')
  stats(): Promise<FeedbackStats> {
    return this.admin.stats();
  }

  @Get()
  list(
    @Query(new ZodPipe(listFeedbackQuerySchema)) query: ListFeedbackQuery,
  ): Promise<Page<FeedbackSummary>> {
    return this.admin.list(query);
  }

  @Get(':id')
  get(@Param('id', new ZodPipe(uuidSchema)) id: string): Promise<FeedbackDetail> {
    return this.admin.get(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Body(new ZodPipe(updateFeedbackRequestSchema)) body: UpdateFeedbackRequest,
  ): Promise<FeedbackDetail> {
    return this.admin.update(user.userId, id, body);
  }
}
