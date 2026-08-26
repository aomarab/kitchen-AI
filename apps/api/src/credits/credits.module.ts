import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { CreditsService } from './credits.service.js';
import { CreditsController } from './credits.controller.js';
import { PurchaseService } from './purchase.service.js';
import { WebhookController } from './webhook.controller.js';
import { PAYMENT_VERIFIER, MockPaymentVerifier } from './payment-verifier.js';
import { RevenueCatVerifier } from './revenuecat.verifier.js';

@Module({
  controllers: [CreditsController, WebhookController],
  providers: [
    CreditsService,
    PurchaseService,
    {
      provide: PAYMENT_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.PAYMENTS_MOCK
          ? new MockPaymentVerifier()
          : new RevenueCatVerifier(env.REVENUECAT_API_KEY),
    },
  ],
  exports: [CreditsService],
})
export class CreditsModule {}
