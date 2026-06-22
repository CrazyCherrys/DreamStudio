import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NewApiConfigModule } from '../new-api-config/new-api-config.module';
import {
  AdminExecutionProfileRevisionsController,
  AdminExecutionProfilesController,
  AdminModelIconsController,
  AdminModelsController,
  AdminModelSyncSnapshotsController,
  PublicModelIconsController,
  PublicModelsController,
} from './model-catalog.controller';
import { ModelCatalogService } from './model-catalog.service';

@Module({
  imports: [AuthModule, NewApiConfigModule],
  controllers: [
    PublicModelsController,
    PublicModelIconsController,
    AdminModelsController,
    AdminExecutionProfilesController,
    AdminExecutionProfileRevisionsController,
    AdminModelIconsController,
    AdminModelSyncSnapshotsController,
  ],
  providers: [ModelCatalogService],
  exports: [ModelCatalogService],
})
export class ModelCatalogModule {}
