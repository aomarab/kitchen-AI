import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/index.js';
import { HealthController } from './health/health.controller.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HouseholdsModule } from './households/households.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AiModule } from './ai/ai.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';

/** Root module. */
@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    AuthModule,
    HouseholdsModule,
    ProfilesModule,
    CatalogModule,
    InventoryModule,
    StorageModule,
    AiModule,
    FeedbackModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
