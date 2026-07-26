import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV, loadEnv, type Env } from '../config/env.js';
import * as schema from './schema.js';

export const DB = Symbol('DB');
export const PG = Symbol('PG');

export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => loadEnv(),
    },
    {
      provide: PG,
      inject: [ENV],
      useFactory: (env: Env) => postgres(env.DATABASE_URL, { max: 10 }),
    },
    {
      provide: DB,
      inject: [PG],
      useFactory: (sql: ReturnType<typeof postgres>): Database => drizzle(sql, { schema }),
    },
  ],
  exports: [DB, PG, ENV],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG) private readonly sql: ReturnType<typeof postgres>) {}

  async onModuleDestroy(): Promise<void> {
    await this.sql?.end({ timeout: 5 });
  }
}

export { schema };
