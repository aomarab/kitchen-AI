import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService],
  // Exported because the live assistant reads the caller's persona at mint.
  exports: [ProfilesService],
})
export class ProfilesModule {}
