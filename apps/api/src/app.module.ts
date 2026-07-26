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

/**
 * Root module. Feature modules are added here by their owning workstream:
 *   Agent A -> CommonModule, AuthModule, HouseholdsModule, ProfilesModule,
 *              CatalogModule, InventoryModule, StorageModule
 *   Agent B -> AiModule (wired in by the coordinator once ready)
 */
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
    // AiModule, // Agent B — coordinator wires this in later.
  ],
  controllers: [HealthController],
})
export class AppModule {}
