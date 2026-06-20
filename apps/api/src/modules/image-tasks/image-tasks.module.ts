import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NewApiConfigModule } from '../new-api-config/new-api-config.module';
import { ImageTasksController } from './image-tasks.controller';
import { ImageTasksService } from './image-tasks.service';

@Module({
  imports: [AuthModule, NewApiConfigModule],
  controllers: [ImageTasksController],
  providers: [ImageTasksService],
})
export class ImageTasksModule {}
