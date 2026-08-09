import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../db/index.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async check(): Promise<{ status: 'ok' | 'degraded'; database: boolean; uptime: number }> {
    let database = false;
    try {
      await this.db.execute(sql`select 1`);
      database = true;
    } catch {
      database = false;
    }

    return {
      status: database ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
    };
  }
}
