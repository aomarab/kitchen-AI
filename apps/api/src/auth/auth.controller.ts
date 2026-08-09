import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from '@nestjs/common';
import {
  loginRequestSchema,
  oauthLoginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  updateMeRequestSchema,
  type LoginRequest,
  type OAuthLoginRequest,
  type RefreshRequest,
  type RegisterRequest,
  type Session,
  type TokenPair,
  type UpdateMeRequest,
  type User,
} from '@kitchen/contracts';
import { ZodPipe } from '../common/http.js';
import { AuthGuard } from '../common/auth.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { AuthUser } from '../common/request-context.js';
import { AuthService } from './auth.service.js';

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('auth/register')
  register(@Body(new ZodPipe(registerRequestSchema)) body: RegisterRequest): Promise<Session> {
    return this.auth.register(body);
  }

  @Post('auth/login')
  login(@Body(new ZodPipe(loginRequestSchema)) body: LoginRequest): Promise<Session> {
    return this.auth.login(body);
  }

  @Post('auth/oauth')
  oauth(@Body(new ZodPipe(oauthLoginRequestSchema)) body: OAuthLoginRequest): Promise<Session> {
    return this.auth.oauthLogin(body);
  }

  @Post('auth/refresh')
  refresh(@Body(new ZodPipe(refreshRequestSchema)) body: RefreshRequest): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('auth/logout')
  @UseGuards(AuthGuard)
  async logout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(refreshRequestSchema)) body: RefreshRequest,
  ): Promise<{ ok: true }> {
    await this.auth.logout(user.userId, body.refreshToken);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthUser): Promise<User> {
    return this.auth.me(user.userId);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateMeRequestSchema)) body: UpdateMeRequest,
  ): Promise<User> {
    return this.auth.updateMe(user.userId, body);
  }
}
