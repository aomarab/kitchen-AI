import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import {
  AI_PROVIDER,
  CATALOG_PORT,
  JOB_STORE,
  OPEN_FOOD_FACTS_CLIENT,
  PANTRY_PORT,
  QUEUE_PLAN,
  QUEUE_RECEIPT,
  REDIS_CLIENT,
  RESPONSE_CACHE,
  USAGE_REPOSITORY,
  YOUTUBE_CLIENT,
} from './ai.constants.js';
import { MockAiProvider } from './providers/mock.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { SchemaGuard } from './validation/schema-guard.js';
import { BudgetService } from './usage/budget.service.js';
import { DrizzleUsageRepository } from './usage/usage.repository.js';
import { AiGateway } from './ai-gateway.service.js';
import { DrizzleIngredientResolver } from './catalog/drizzle-ingredient-resolver.js';
import { DrizzlePantryRepository } from './planner/drizzle-pantry.repository.js';
import { RedisResponseCache } from './cache/response-cache.js';
import { MockYoutubeClient } from './clients/mock-youtube.client.js';
import { HttpYoutubeClient } from './clients/http-youtube.client.js';
import { MockOpenFoodFactsClient } from './clients/mock-open-food-facts.client.js';
import { HttpOpenFoodFactsClient } from './clients/http-open-food-facts.client.js';
import { DrizzleJobStore } from './jobs/job-store.js';
import { JobsService } from './jobs/jobs.service.js';
import { JobsController } from './jobs/jobs.controller.js';
import { PlanProcessor } from './jobs/plan.processor.js';
import { ReceiptProcessor } from './jobs/receipt.processor.js';
import { RecognitionService } from './recognition/recognition.service.js';
import { CaptureController } from './recognition/capture.controller.js';
import { BarcodeService } from './barcode/barcode.service.js';
import { ReceiptService } from './receipt/receipt.service.js';
import { RecipesService } from './recipes/recipes.service.js';
import { RecipesController } from './recipes/recipes.controller.js';
import { PlannerService } from './planner/planner.service.js';
import { PlanService } from './plan/plan.service.js';
import { PlanController } from './plan/plan.controller.js';
import { ShoppingService } from './shopping/shopping.service.js';
import { ShoppingController } from './shopping/shopping.controller.js';
import { UsageController } from './usage/usage.controller.js';

/** Parses a redis:// URL into ioredis/BullMQ connection options. */
function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: u.password } : {}),
    ...(u.username ? { username: u.username } : {}),
    ...(u.pathname && u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
    maxRetriesPerRequest: null as null,
  };
}

/**
 * The AI feature module (spec §5). Owns every AI pipeline — vision recognition,
 * barcode lookup, receipt parsing, the three-stage meal planner, recipe/video
 * endpoints, shopping, jobs and usage. Providers are selected by `env.AI_MOCK`:
 * when true, all external calls (OpenAI, YouTube, Open Food Facts) resolve to
 * recorded fixtures so the whole system runs offline and free.
 *
 * INTEGRATION POINT (coordinator): import this module in `app.module.ts`. It
 * assumes an auth guard has populated `request.user.id` and that the
 * `x-household-id` header is present (both handled by Agent A's guards).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ connection: redisConnection(env.REDIS_URL) }),
    }),
    BullModule.registerQueue({ name: QUEUE_PLAN }, { name: QUEUE_RECEIPT }),
  ],
  controllers: [
    CaptureController,
    JobsController,
    RecipesController,
    PlanController,
    ShoppingController,
    UsageController,
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(redisConnection(env.REDIS_URL)),
    },
    {
      provide: AI_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.AI_MOCK
          ? new MockAiProvider()
          : new OpenAiProvider(env.OPENAI_API_KEY, {
              cheap: env.OPENAI_MODEL_CHEAP,
              vision: env.OPENAI_MODEL_VISION,
              planning: env.OPENAI_MODEL_PLANNING,
            }),
    },
    {
      provide: YOUTUBE_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.AI_MOCK ? new MockYoutubeClient() : new HttpYoutubeClient(env.YOUTUBE_API_KEY),
    },
    {
      provide: OPEN_FOOD_FACTS_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.AI_MOCK
          ? new MockOpenFoodFactsClient()
          : new HttpOpenFoodFactsClient(env.OPEN_FOOD_FACTS_URL),
    },
    { provide: RESPONSE_CACHE, useClass: RedisResponseCache },
    { provide: CATALOG_PORT, useClass: DrizzleIngredientResolver },
    { provide: USAGE_REPOSITORY, useClass: DrizzleUsageRepository },
    { provide: PANTRY_PORT, useClass: DrizzlePantryRepository },
    { provide: JOB_STORE, useClass: DrizzleJobStore },
    SchemaGuard,
    BudgetService,
    AiGateway,
    JobsService,
    RecognitionService,
    BarcodeService,
    ReceiptService,
    RecipesService,
    PlannerService,
    PlanService,
    ShoppingService,
    PlanProcessor,
    ReceiptProcessor,
  ],
})
export class AiModule {}
