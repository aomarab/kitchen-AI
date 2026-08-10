import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import {
  submitFeedbackRequestSchema,
  type SubmitFeedbackRequest,
  type SubmitFeedbackResponse,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser } from '../common/request-context.js';
import { FeedbackService } from './feedback.service.js';

/** Feedback belongs to a user, not a household — no `HouseholdGuard` here. */
@Controller('feedback')
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}

  @Post()
  submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(submitFeedbackRequestSchema)) body: SubmitFeedbackRequest,
  ): Promise<SubmitFeedbackResponse> {
    return this.feedback.submit(user.userId, body);
  }
}
