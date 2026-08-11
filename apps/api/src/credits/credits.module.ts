import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service.js';
import { CreditsController } from './credits.controller.js';
import { PurchaseService } from './purchase.service.js';

@Module({
  controllers: [CreditsController],
  providers: [CreditsService, PurchaseService],
  exports: [CreditsService],
})
export class CreditsModule {}
