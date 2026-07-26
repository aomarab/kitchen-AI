import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/index.js';
import { HealthController } from './health/health.controller.js';

/**
 * Root module. Feature modules are added here by their owning workstream:
 *   Agent A -> AuthModule, HouseholdModule, InventoryModule, CatalogModule
 *   Agent B -> AiModule
 */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
