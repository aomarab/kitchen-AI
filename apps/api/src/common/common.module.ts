import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env.js';
import { AuthGuard } from './auth.guard.js';
import { HouseholdGuard } from './household.guard.js';
import { StaffGuard } from './staff.guard.js';

/**
 * Cross-cutting security primitives shared by every feature module. Registered
 * `@Global()` so the guards and `JwtService` resolve anywhere without each
 * module re-importing them. The JWT signing secret and access-token TTL come
 * from the validated environment.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL },
      }),
    }),
  ],
  providers: [AuthGuard, HouseholdGuard, StaffGuard],
  exports: [AuthGuard, HouseholdGuard, StaffGuard, JwtModule],
})
export class CommonModule {}
