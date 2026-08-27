import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ENV, type Env } from '../config/env.js';
import { redisConnection } from '../common/redis.js';
import { ReminderOccurrencesController } from './reminder-occurrences.controller.js';
import {
  QUEUE_REMINDER_SWEEP,
  ReminderSweepProcessor,
  ReminderSweepScheduler,
} from './reminder-sweep.processor.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersFiringService } from './reminders-firing.service.js';
import { RemindersService } from './reminders.service.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: redisConnection(env.REDIS_URL),
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_REMINDER_SWEEP }),
  ],
  controllers: [RemindersController, ReminderOccurrencesController],
  providers: [
    RemindersService,
    RemindersFiringService,
    ReminderSweepProcessor,
    ReminderSweepScheduler,
  ],
  exports: [RemindersFiringService],
})
export class RemindersModule {}
