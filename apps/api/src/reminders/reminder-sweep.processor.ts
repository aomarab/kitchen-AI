import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ENV, type Env } from '../config/env.js';
import { RemindersFiringService } from './reminders-firing.service.js';

export const QUEUE_REMINDER_SWEEP = 'reminders.sweep';

/** How often the sweep looks for due nudges. */
export const REMINDER_SWEEP_INTERVAL_MS = 60_000;

/**
 * The repeatable trigger for the wellness engine. Deliberately three lines: it
 * decides *when* to look, never *what* is due — that is
 * `RemindersFiringService.sweep`, which takes an injected clock so every rule
 * is testable against a real database without a running worker.
 */
@Processor(QUEUE_REMINDER_SWEEP)
export class ReminderSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderSweepProcessor.name);

  constructor(
    @Inject(RemindersFiringService)
    private readonly firing: RemindersFiringService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const fired = await this.firing.sweep(new Date());
    if (fired.length > 0) this.logger.log(`fired ${fired.length} wellness nudge(s)`);
  }
}

/**
 * Registers the repeatable job once the app is up.
 *
 * Skipped under `NODE_ENV=test`: several suites boot the whole `AppModule`, and
 * a worker sweeping the same database mid-suite would insert nudges into other
 * tests' households — the classic check that passes only because of what a
 * neighbouring test left behind.
 */
@Injectable()
export class ReminderSweepScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReminderSweepScheduler.name);

  constructor(
    @InjectQueue(QUEUE_REMINDER_SWEEP) private readonly queue: Queue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    await this.queue.upsertJobScheduler('reminder-sweep', {
      every: REMINDER_SWEEP_INTERVAL_MS,
    });
    this.logger.log(`wellness sweep scheduled every ${REMINDER_SWEEP_INTERVAL_MS / 1000}s`);
  }
}
