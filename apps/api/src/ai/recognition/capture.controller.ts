import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  barcodeLookupQuerySchema,
  parseReceiptRequestSchema,
  recognizeRequestSchema,
  type BarcodeLookupQuery,
  type BarcodeLookupResponse,
  type Job,
  type ParseReceiptRequest,
  type RecognitionSession,
  type RecognizeRequest,
} from '@kitchen/contracts';
import { RequiredIdempotencyKey, ZodPipe } from '../../common/http.js';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentHousehold } from '../../common/current-household.decorator.js';
import type { AuthUser, HouseholdContext } from '../../common/request-context.js';
import { RecognitionService } from '../recognition/recognition.service.js';
import { BarcodeService } from '../barcode/barcode.service.js';
import { JobsService } from '../jobs/jobs.service.js';

/**
 * Capture endpoints (spec §5.1–5.3). Photo recognition and barcode lookup run
 * synchronously; receipt parsing is enqueued as a job and polled via `getJob`.
 * None of these auto-commit to inventory — they yield review sessions. Every
 * route is `auth: true` + `household: true` in the registry, so the whole
 * controller is guarded.
 */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class CaptureController {
  constructor(
    @Inject(RecognitionService) private readonly recognition: RecognitionService,
    @Inject(BarcodeService) private readonly barcode: BarcodeService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  @Post('inventory/recognize')
  recognize(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(recognizeRequestSchema)) body: RecognizeRequest,
  ): Promise<RecognitionSession> {
    return this.recognition.recognize({
      householdId: household.id,
      userId: user.userId,
      request: body,
    });
  }

  @Get('inventory/lookup')
  lookup(
    @Query(new ZodPipe(barcodeLookupQuerySchema)) query: BarcodeLookupQuery,
  ): Promise<BarcodeLookupResponse> {
    return this.barcode.lookup(query.barcode);
  }

  @Post('inventory/receipts')
  parseReceipt(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @RequiredIdempotencyKey() idempotencyKey: string,
    @Body(new ZodPipe(parseReceiptRequestSchema)) body: ParseReceiptRequest,
  ): Promise<Job> {
    return this.jobs.enqueueReceipt(
      household.id,
      { userId: user.userId, request: body },
      idempotencyKey,
    );
  }

  @Get('inventory/recognition-sessions/:id')
  getSession(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id') id: string,
  ): Promise<RecognitionSession> {
    return this.recognition.getSession(household.id, id);
  }
}
