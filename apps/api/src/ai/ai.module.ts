import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { StorageModule } from '../storage/storage.module.js';
import { CreditsModule } from '../credits/credits.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import type { AiProvider } from './providers/ai-provider.interface.js';
import {
  AI_PROVIDER,
  CATALOG_PORT,
  EMBEDDINGS_PORT,
  JOB_STORE,
  OPEN_FOOD_FACTS_CLIENT,
  PANTRY_PORT,
  QUEUE_PLAN,
  QUEUE_RECEIPT,
  REALTIME_SESSION_PROVIDER,
  REDIS_CLIENT,
  RESPONSE_CACHE,
  USAGE_REPOSITORY,
  YOUTUBE_CLIENT,
} from './ai.constants.js';
import { MockAiProvider } from './providers/mock.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { RoutedAiProvider } from './providers/routed.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { SchemaGuard } from './validation/schema-guard.js';
import { BudgetService } from './usage/budget.service.js';
import { DrizzleUsageRepository } from './usage/usage.repository.js';
import { AiGateway } from './ai-gateway.service.js';
import { DrizzleIngredientResolver } from './catalog/drizzle-ingredient-resolver.js';
import { MockEmbeddings } from './catalog/mock-embeddings.js';
import { OpenAiEmbeddings } from './catalog/openai-embeddings.js';
import { DrizzlePantryRepository } from './planner/drizzle-pantry.repository.js';
import { RedisResponseCache } from './cache/response-cache.js';
import { MockYoutubeClient } from './clients/mock-youtube.client.js';
import { HttpYoutubeClient } from './clients/http-youtube.client.js';
import { MockOpenFoodFactsClient } from './clients/mock-open-food-facts.client.js';
import { HttpOpenFoodFactsClient } from './clients/http-open-food-facts.client.js';
import { MockRealtimeSessionProvider } from './assistant/mock-realtime.provider.js';
import { OpenAiRealtimeSessionProvider } from './assistant/openai-realtime.provider.js';
import { AssistantService } from './assistant/assistant.service.js';
import { AssistantController } from './assistant/assistant.controller.js';
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
import { MediaService } from './recipes/media.service.js';
import { RecipeTranslationService } from './recipes/translation.service.js';
import { RecipesController } from './recipes/recipes.controller.js';
import { PlannerService } from './planner/planner.service.js';
import { PlanService } from './plan/plan.service.js';
import { PlanController } from './plan/plan.controller.js';
import { ShoppingService } from './shopping/shopping.service.js';
import { ShoppingController } from './shopping/shopping.controller.js';
import { UsageController } from './usage/usage.controller.js';
import { ActionCostQuery } from './usage/action-cost.query.js';
import { CreditCalibrationService } from './usage/calibration.service.js';
import { AdminCreditsController } from './usage/admin-credits.controller.js';
import { redisConnection } from '../common/redis.js';

/**
 * Constructs the `AI_PROVIDER` value from the environment. Extracted so the
 * factory logic can be unit-tested independently of the NestJS module graph.
 */
export function createAiProvider(env: Env): AiProvider {
  if (env.AI_MOCK) return new MockAiProvider();

  const openai = new OpenAiProvider(
    env.OPENAI_API_KEY,
    {
      cheap: env.OPENAI_MODEL_CHEAP,
      vision: env.OPENAI_MODEL_VISION,
      planning: env.OPENAI_MODEL_PLANNING,
    },
    { baseURL: env.OPENAI_BASE_URL },
  );

  let vision: AiProvider = openai;
  if (env.AI_VISION_VENDOR === 'gemini') {
    if (env.GEMINI_API_KEY.trim() === '') {
      throw new Error(
        'AI_VISION_VENDOR is set to "gemini" but GEMINI_API_KEY is empty. ' +
          'Provide a key or set AI_VISION_VENDOR=openai.',
      );
    }
    vision = new GeminiProvider(env.GEMINI_API_KEY, { vision: env.GEMINI_MODEL_VISION });
  }

  return new RoutedAiProvider(
    { cheap: openai, vision, planning: openai },
    env.AI_VISION_VENDOR === 'gemini' ? { vision: openai } : {},
  );
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
    // Vision needs presigned GET URLs for uploaded photos.
    StorageModule,
    CreditsModule,
    // The live assistant reads the caller's assistant persona before minting.
    ProfilesModule,
  ],
  controllers: [
    CaptureController,
    JobsController,
    RecipesController,
    PlanController,
    ShoppingController,
    UsageController,
    AssistantController,
    AdminCreditsController,
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
      useFactory: createAiProvider,
    },
    {
      provide: YOUTUBE_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.AI_MOCK ? new MockYoutubeClient() : new HttpYoutubeClient(env.YOUTUBE_API_KEY),
    },
    {
      provide: REALTIME_SESSION_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        // The realtime API lives only on api.openai.com, so a gateway key
        // (OPENAI_BASE_URL set, e.g. OpenRouter) cannot mint a session with it.
        // Require a dedicated realtime key in that case; only fall back to the
        // shared key when we are talking to OpenAI directly.
        const realtimeKey =
          env.OPENAI_REALTIME_API_KEY.trim() ||
          (env.OPENAI_BASE_URL.trim() ? '' : env.OPENAI_API_KEY.trim());
        // No usable realtime key means the assistant runs as an honest scripted
        // demo rather than failing every mint against the wrong host.
        return env.AI_MOCK || !realtimeKey
          ? new MockRealtimeSessionProvider()
          : new OpenAiRealtimeSessionProvider(realtimeKey, env.OPENAI_MODEL_REALTIME);
      },
    },
    AssistantService,
    {
      provide: OPEN_FOOD_FACTS_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.AI_MOCK
          ? new MockOpenFoodFactsClient()
          : new HttpOpenFoodFactsClient(env.OPEN_FOOD_FACTS_URL),
    },
    { provide: RESPONSE_CACHE, useClass: RedisResponseCache },
    {
      provide: EMBEDDINGS_PORT,
      inject: [ENV],
      useFactory: (env: Env) =>
        // Real embeddings need OpenAI's own `/embeddings` endpoint. An
        // OpenAI-compatible chat gateway like OpenRouter does not serve it, so
        // whenever OPENAI_BASE_URL routes chat elsewhere we stay on the offline
        // mock (the ingredient resolver degrades gracefully to name matching).
        env.AI_MOCK || (env.OPENAI_BASE_URL ?? '').trim() !== ''
          ? new MockEmbeddings()
          : new OpenAiEmbeddings(env.OPENAI_API_KEY),
    },
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
    MediaService,
    RecipeTranslationService,
    PlannerService,
    PlanService,
    ShoppingService,
    PlanProcessor,
    ReceiptProcessor,
    ActionCostQuery,
    CreditCalibrationService,
  ],
})
export class AiModule {}
