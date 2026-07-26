import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { OAuthService } from './oauth.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, OAuthService],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
