import { Module } from '@nestjs/common';
import { AdminFeedbackController } from './admin-feedback.controller.js';
import { AdminFeedbackService } from './admin-feedback.service.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({
  controllers: [FeedbackController, AdminFeedbackController],
  providers: [FeedbackService, AdminFeedbackService],
  exports: [FeedbackService, AdminFeedbackService],
})
export class FeedbackModule {}
