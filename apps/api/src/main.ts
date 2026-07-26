import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AppExceptionFilter } from './common/errors.js';
import { corsOrigins, loadEnv } from './config/env.js';
import { JSON_BODY_LIMIT } from './common/limits.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors({
    origin: corsOrigins(env),
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-household-id', 'idempotency-key'],
  });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on http://localhost:${env.API_PORT}`);
}

void bootstrap();
