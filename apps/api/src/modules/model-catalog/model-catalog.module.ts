import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NewApiConfigModule } from '../new-api-config/new-api-config.module';
import {
  AdminModelCategoriesController,
  AdminModelsController,
  AdminModelSyncSnapshotsController,
  PublicModelCategoriesController,
  PublicModelsController,
} from './model-catalog.controller';
import { ModelCatalogService } from './model-catalog.service';

@Module({
  imports: [AuthModule, NewApiConfigModule],
  controllers: [
    PublicModelCategoriesController,
    PublicModelsController,
    AdminModelCategoriesController,
    AdminModelsController,
    AdminModelSyncSnapshotsController,
  ],
  providers: [ModelCatalogService],
  exports: [ModelCatalogService],
})
export class ModelCatalogModule {}
