import { Module } from '@nestjs/common';

import { DreamStudioSecretCodec } from '@dreamstudio/storage';

import { ImageGenerationService } from './image-generation/image-generation.service';
import { WorkerService } from './worker.service';

@Module({
  providers: [DreamStudioSecretCodec, ImageGenerationService, WorkerService],
})
export class AppModule {}
