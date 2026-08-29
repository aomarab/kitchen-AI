import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ZodPipe } from '../common/http.js';
import { AppError } from '../common/errors.js';
import { ENV, type Env } from '../config/env.js';
import { PurchaseService, type WebhookEvent } from './purchase.service.js';

/**
 * RevenueCat webhook body (the subset we act on). RevenueCat POSTs
 * `{ api_version, event: { … } }`. There is no `intent_id` field — a customer's
 * purchases are keyed by `app_user_id`, which the client sets to the purchase
 * intent id before checkout (`Purchases.logIn(intentId)`, spec §6.2), so that is
 * what resolves the household on a webhook-first delivery.
 *
 * Only the purchase/refund events carry a transaction and product; the store's
 * many other event types (and its TEST ping) must pass validation and be ignored
 * downstream rather than 400 — a rejected delivery is one RevenueCat retries
 * forever. The `store` is left as a free string because the Test Store and future
 * stores report values outside the App/Play set and none of them affect crediting.
 */
const revenueCatWebhookSchema = z
  .object({
    event: z
      .object({
        type: z.string().min(1),
        app_user_id: z.string().min(1),
        transaction_id: z.string().min(1).nullish(),
        product_id: z.string().min(1).nullish(),
        store: z.string().min(1).nullish(),
      })
      .passthrough(),
  })
  .passthrough();
type RevenueCatWebhook = z.infer<typeof revenueCatWebhookSchema>;

function toWebhookEvent(body: RevenueCatWebhook): WebhookEvent {
  const { event } = body;
  return {
    type: event.type,
    intentId: event.app_user_id,
    storeTransactionId: event.transaction_id ?? undefined,
    productId: event.product_id ?? undefined,
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
