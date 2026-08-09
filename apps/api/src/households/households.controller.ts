import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createHouseholdRequestSchema,
  joinHouseholdRequestSchema,
  updateHouseholdRequestSchema,
  uuidSchema,
  type CreateHouseholdRequest,
  type Household,
  type JoinHouseholdRequest,
  type UpdateHouseholdRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser } from '../common/request-context.js';
import { HouseholdsService } from './households.service.js';

@Controller('households')
@UseGuards(AuthGuard)
export class HouseholdsController {
  constructor(@Inject(HouseholdsService) private readonly households: HouseholdsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Household[]> {
    return this.households.list(user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createHouseholdRequestSchema)) body: CreateHouseholdRequest,
  ): Promise<Household> {
    return this.households.create(user.userId, body);
  }

  @Post('join')
  join(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(joinHouseholdRequestSchema)) body: JoinHouseholdRequest,
  ): Promise<Household> {
    return this.households.join(user.userId, body.inviteCode);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
    @Body(new ZodPipe(updateHouseholdRequestSchema)) body: UpdateHouseholdRequest,
  ): Promise<Household> {
    return this.households.update(user.userId, id, body);
  }

  @Post(':id/invite-code')
  rotateInviteCode(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
  ): Promise<Household> {
    return this.households.rotateInviteCode(user.userId, id);
  }

  @Delete(':id/members/me')
  async leave(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodPipe(uuidSchema)) id: string,
  ): Promise<{ ok: true }> {
    await this.households.leave(user.userId, id);
    return { ok: true };
  }
}
