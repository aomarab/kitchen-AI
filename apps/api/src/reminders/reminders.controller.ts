import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import {
  updateReminderSettingsRequestSchema,
  type ReminderSettings,
  type UpdateReminderSettingsRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import type { HouseholdContext } from '../common/request-context.js';
import { RemindersService } from './reminders.service.js';

@Controller('reminders/settings')
@UseGuards(AuthGuard, HouseholdGuard)
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

  @Get()
  get(@CurrentHousehold() household: HouseholdContext): Promise<ReminderSettings> {
    return this.reminders.get(household.id);
  }

  @Patch()
  update(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(updateReminderSettingsRequestSchema)) body: UpdateReminderSettingsRequest,
  ): Promise<ReminderSettings> {
    return this.reminders.update(household.id, body);
  }
}
