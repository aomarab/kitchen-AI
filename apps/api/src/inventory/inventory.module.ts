import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { LocationsService } from './locations.service.js';
import { InventoryService } from './inventory.service.js';
import { LocationsController } from './locations.controller.js';
import { InventoryController } from './inventory.controller.js';

@Module({
  imports: [CatalogModule],
  controllers: [LocationsController, InventoryController],
  providers: [LocationsService, InventoryService],
  exports: [LocationsService, InventoryService],
})
export class InventoryModule {}
