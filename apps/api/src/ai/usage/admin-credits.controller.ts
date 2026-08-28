import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  creditCalibrationQuerySchema,
  type CreditCalibration,
  type CreditCalibrationQuery,
} from '@kitchen/contracts';
import { ZodPipe } from '../../common/http.js';
import { AuthGuard } from '../../common/auth.guard.js';
import { StaffGuard } from '../../common/staff.guard.js';
import { CreditCalibrationService } from './calibration.service.js';

/**
 * Staff-only "are we covering costs?" report. `StaffGuard` is the boundary — the
 * web `AdminGate` only hides the UI. Guard order matters: `AuthGuard` populates
 * `request.authUser` before `StaffGuard` reads the role from the database.
 */
@Controller('admin/credits')
@UseGuards(AuthGuard, StaffGuard)
export class AdminCreditsController {
  constructor(
    @Inject(CreditCalibrationService) private readonly calibration: CreditCalibrationService,
  ) {}

  @Get('calibration')
  calibrate(
    @Query(new ZodPipe(creditCalibrationQuerySchema)) query: CreditCalibrationQuery,
  ): Promise<CreditCalibration> {
    return this.calibration.calibrate(query.days);
  }
}
