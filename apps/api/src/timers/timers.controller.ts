import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createTimerRequestSchema,
  updateTimerRequestSchema,
  uuidSchema,
  type CookingTimer,
  type CreateTimerRequest,
  type TimerList,
  type UpdateTimerRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { CurrentHousehold } from '../common/current-household.decorator.js';
import type { HouseholdContext } from '../common/request-context.js';
import { TimersService } from './timers.service.js';

@Controller('timers')
@UseGuards(AuthGuard, HouseholdGuard)
export class TimersController {
  constructor(@Inject(TimersService) private readonly timers: TimersService) {}

  @Get()
  async list(@CurrentHousehold() household: HouseholdContext): Promise<TimerList> {
    return { items: await this.timers.list(household.id) };
  }

  @Post()
  create(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(createTimerRequestSchema)) body: CreateTimerRequest,
  ): Promise<CookingTimer> {
    return this.timers.create(household.id, body);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Body(new ZodPipe(updateTimerRequestSchema)) body: UpdateTimerRequest,
  ): Promise<CookingTimer> {
    return this.timers.update(household.id, id, body);
  }

  @Delete(':id')
  async remove(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
  ): Promise<{ ok: true }> {
    await this.timers.remove(household.id, id);
    return { ok: true };
  }
}
