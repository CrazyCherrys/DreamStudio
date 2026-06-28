import { Module } from '@nestjs/common';

import { DreamStudioSecretCodec } from '@dreamstudio/storage';

import { ImageGenerationService } from './image-generation/image-generation.service';
import { WorkerSystemSettingsService } from './system-settings.service';
import { WorkerService } from './worker.service';

@Module({
  providers: [
    DreamStudioSecretCodec,
    WorkerSystemSettingsService,
    ImageGenerationService,
    WorkerService,
  ],
})
export class AppModule {}
