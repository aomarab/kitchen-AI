import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { redisConnection } from '../common/redis.js';
import { HouseholdsController } from './households.controller.js';
import { HouseholdsService } from './households.service.js';
import { HOUSEHOLD_JOIN_REDIS, JoinAttemptLimiter } from './join-attempt-limiter.js';

@Module({
  controllers: [HouseholdsController],
  providers: [
    {
      provide: HOUSEHOLD_JOIN_REDIS,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(redisConnection(env.REDIS_URL)),
    },
    JoinAttemptLimiter,
    HouseholdsService,
  ],
})
export class HouseholdsModule {}
