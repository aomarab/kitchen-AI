import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { OAuthService } from './oauth.service.js';
import { APPLE_TOKEN_REVOKER } from './auth.constants.js';
import {
  type AppleTokenRevoker,
  MockAppleTokenRevoker,
  HttpAppleTokenRevoker,
} from './apple-token-revoker.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    OAuthService,
    {
      provide: APPLE_TOKEN_REVOKER,
      inject: [ENV],
      useFactory: (env: Env): AppleTokenRevoker =>
        env.APPLE_REVOKE_MOCK ? new MockAppleTokenRevoker() : new HttpAppleTokenRevoker(env),
    },
  ],
  exports: [PasswordService, TokenService, APPLE_TOKEN_REVOKER],
})
export class AuthModule {}
