import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import {
  updateProfileRequestSchema,
  type Profile,
  type UpdateProfileRequest,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser } from '../common/request-context.js';
import { ProfilesService } from './profiles.service.js';

@Controller('profile')
@UseGuards(AuthGuard)
export class ProfilesController {
  constructor(@Inject(ProfilesService) private readonly profiles: ProfilesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<Profile> {
    return this.profiles.get(user.userId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<Profile> {
    return this.profiles.update(user.userId, body);
  }
}
