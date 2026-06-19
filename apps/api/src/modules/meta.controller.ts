import { Controller, Get } from '@nestjs/common';

import { publicConfigSnapshot } from '@dreamstudio/config';
import { ASSET_CLEANUP_QUEUE, IMAGE_GENERATION_QUEUE } from '@dreamstudio/queue';

@Controller('meta')
export class MetaController {
  @Get()
  getMeta() {
    return {
      app: 'dreamstudio',
      version: '0.0.0',
      scope: 'm0-foundation',
      modules: ['web', 'api', 'worker'],
      queues: [IMAGE_GENERATION_QUEUE, ASSET_CLEANUP_QUEUE],
      config: publicConfigSnapshot(),
    };
  }
}
