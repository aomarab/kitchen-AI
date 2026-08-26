import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ZodPipe } from '../common/http.js';
import { AppError } from '../common/errors.js';
import { ENV, type Env } from '../config/env.js';
import { PurchaseService, type WebhookEvent } from './purchase.service.js';

/**
 * RevenueCat webhook body (the subset we act on). RevenueCat POSTs
 * `{ event: { … } }`; the `intent_id` is the purchase intent recorded before
 * checkout (spec §6.2), carried through RevenueCat so a webhook-first delivery
 * can resolve the household.
 */
const revenueCatWebhookSchema = z.object({
  event: z.object({
    type: z.string().min(1),
    intent_id: z.string().uuid(),
    transaction_id: z.string().min(1),
    product_id: z.string().min(1),
    store: z.enum(['APP_STORE', 'MAC_APP_STORE', 'PLAY_STORE']),
  }),
});
type RevenueCatWebhook = z.infer<typeof revenueCatWebhookSchema>;

function toWebhookEvent(body: RevenueCatWebhook): WebhookEvent {
  const { event } = body;
  return {
    type: event.type,
    intentId: event.intent_id,
    storeTransactionId: event.transaction_id,
    productId: event.product_id,
    store: event.store === 'PLAY_STORE' ? 'google' : 'apple',
  };
}

/** Constant-time comparison that never throws on a length mismatch. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * RevenueCat webhook (spec §6, §7). Deliberately **not** behind
 * `AuthGuard`/`HouseholdGuard`: the caller is RevenueCat, not a signed-in user.
 * The constant-time secret check below is therefore the only barrier between the
 * public internet and free credits — an unsigned or wrongly-signed call is
 * refused before it can move any balance.
 */
@Controller('webhooks')
export class WebhookController {
  constructor(
    @Inject(PurchaseService) private readonly purchases: PurchaseService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('revenuecat')
  @HttpCode(200)
  async revenuecat(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodPipe(revenueCatWebhookSchema)) body: RevenueCatWebhook,
  ): Promise<{ ok: true }> {
    this.assertAuthentic(authorization);
    await this.purchases.applyWebhook(toWebhookEvent(body));
    return { ok: true };
  }

  private assertAuthentic(authorization: string | undefined): void {
    const secret = this.env.REVENUECAT_WEBHOOK_SECRET;
    // Fail closed: an unconfigured secret must never accept a caller, or an
    // empty Authorization header would silently authenticate the internet.
    if (secret === '' || !authorization || !secretMatches(authorization, secret)) {
      throw AppError.unauthenticated('errors.UNAUTHENTICATED');
    }
  }
}
