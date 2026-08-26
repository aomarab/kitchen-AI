import { Module } from '@nestjs/common';
import { AdminFeedbackController } from './admin-feedback.controller.js';
import { AdminFeedbackService } from './admin-feedback.service.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';
import {
  AdminProductFeedbackController,
  ProductFeedbackController,
} from './product-feedback.controller.js';
import { ProductFeedbackService } from './product-feedback.service.js';

@Module({
  controllers: [
    FeedbackController,
    AdminFeedbackController,
    ProductFeedbackController,
    AdminProductFeedbackController,
  ],
  providers: [FeedbackService, AdminFeedbackService, ProductFeedbackService],
  exports: [FeedbackService, AdminFeedbackService, ProductFeedbackService],
})
export class FeedbackModule {}
