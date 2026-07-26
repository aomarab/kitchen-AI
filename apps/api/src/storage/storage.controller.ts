import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import {
  presignUploadRequestSchema,
  type PresignUploadRequest,
  type PresignUploadResponse,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import type { HouseholdContext } from '../common/request-context.js';
import { StorageService } from './storage.service.js';

@Controller('uploads')
@UseGuards(AuthGuard, HouseholdGuard)
export class StorageController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Post('presign')
  presign(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(presignUploadRequestSchema)) body: PresignUploadRequest,
  ): Promise<PresignUploadResponse> {
    return this.storage.presignUpload(household.id, body);
  }
}
