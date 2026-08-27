import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import type { CreateRealtimeSessionRequest, RealtimeSession } from '@kitchen/contracts';
import { createRealtimeSessionRequestSchema } from '@kitchen/contracts';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import { CurrentHousehold } from '../../common/current-household.decorator.js';
import type { HouseholdContext } from '../../common/request-context.js';
import { ZodPipe } from '../../common/http.js';
import { AssistantService } from './assistant.service.js';

/**
 * Mints the ephemeral credential for a live assistant session (spec Feature 5).
 *
 * `POST` rather than `GET` even though it reads like a fetch: every call costs
 * credits and mints a new bearer credential, so it must never be cached,
 * prefetched or retried by a proxy.
 */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  @Post('assistant/sessions')
  create(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(createRealtimeSessionRequestSchema)) body: CreateRealtimeSessionRequest,
  ): Promise<RealtimeSession> {
    return this.assistant.createSession(household.id, body.locale);
  }
}
