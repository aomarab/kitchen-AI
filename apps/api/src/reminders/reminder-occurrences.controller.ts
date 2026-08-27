import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  listReminderOccurrencesQuerySchema,
  uuidSchema,
  type ListReminderOccurrencesQuery,
  type ReminderOccurrence,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import type { HouseholdContext } from '../common/request-context.js';
import { RemindersFiringService } from './reminders-firing.service.js';

@Controller('reminders/occurrences')
@UseGuards(AuthGuard, HouseholdGuard)
export class ReminderOccurrencesController {
  constructor(
    @Inject(RemindersFiringService)
    private readonly firing: RemindersFiringService,
  ) {}

  @Get()
  list(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(listReminderOccurrencesQuerySchema))
    query: ListReminderOccurrencesQuery,
  ): Promise<ReminderOccurrence[]> {
    return this.firing.list(household.id, query.since);
  }

  @Post(':id/acknowledge')
  acknowledge(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
  ): Promise<ReminderOccurrence> {
    return this.firing.acknowledge(household.id, id);
  }
}
