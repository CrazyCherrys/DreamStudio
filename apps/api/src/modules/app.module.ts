import { Module } from '@nestjs/common';

import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ImageTasksModule } from './image-tasks/image-tasks.module';
import { MetaController } from './meta.controller';
import { ModelCatalogModule } from './model-catalog/model-catalog.module';
import { NewApiConfigModule } from './new-api-config/new-api-config.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    AuthModule,
    NewApiConfigModule,
    ModelCatalogModule,
    StorageModule,
    ImageTasksModule,
    AdminModule,
  ],
  controllers: [HealthController, MetaController],
})
export class AppModule {}
