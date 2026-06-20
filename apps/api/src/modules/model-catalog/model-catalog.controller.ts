import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ModelCatalogService } from './model-catalog.service';
import type { AiModelBody, ModelCategoryBody, ModelSyncSnapshotBody } from './model-catalog.types';

@Controller('model-categories')
@UseGuards(SessionAuthGuard)
export class PublicModelCategoriesController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Get()
  listCategories() {
    return this.modelCatalogService.listPublicCategories();
  }
}

@Controller('models')
@UseGuards(SessionAuthGuard)
export class PublicModelsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Get()
  listModels(@Query() query: Record<string, unknown>) {
    return this.modelCatalogService.listPublicModels(query);
  }

  @Get(':modelRecordId')
  getModel(@Param('modelRecordId') modelRecordId: string) {
    return this.modelCatalogService.getPublicModel(modelRecordId);
  }
}

@Controller('admin/model-categories')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminModelCategoriesController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Get()
  listCategories() {
    return this.modelCatalogService.listAdminCategories();
  }

  @Post()
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  createCategory(@Body() body: ModelCategoryBody, @Req() request: AuthenticatedRequest & Request) {
    return this.modelCatalogService.createCategory(body, request.auth!, request);
  }

  @Patch(':categoryId')
  @UseGuards(CsrfGuard)
  updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() body: ModelCategoryBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.updateCategory(categoryId, body, request.auth!, request);
  }

  @Delete(':categoryId')
  @UseGuards(CsrfGuard)
  deleteCategory(
    @Param('categoryId') categoryId: string,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.deleteCategory(categoryId, request.auth!, request);
  }
}

@Controller('admin/models')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminModelsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Get()
  listModels(@Query() query: Record<string, unknown>) {
    return this.modelCatalogService.listAdminModels(query);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  createModel(@Body() body: AiModelBody, @Req() request: AuthenticatedRequest & Request) {
    return this.modelCatalogService.createModel(body, request.auth!, request);
  }

  @Get(':modelRecordId')
  getModel(@Param('modelRecordId') modelRecordId: string) {
    return this.modelCatalogService.getAdminModel(modelRecordId);
  }

  @Patch(':modelRecordId')
  @UseGuards(CsrfGuard)
  updateModel(
    @Param('modelRecordId') modelRecordId: string,
    @Body() body: AiModelBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.updateModel(modelRecordId, body, request.auth!, request);
  }

  @Delete(':modelRecordId')
  @UseGuards(CsrfGuard)
  deleteModel(
    @Param('modelRecordId') modelRecordId: string,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.deleteModel(modelRecordId, request.auth!, request);
  }
}

@Controller('admin/model-sync-snapshots')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminModelSyncSnapshotsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  createSnapshot(
    @Body() body: ModelSyncSnapshotBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.createSnapshot(body, request.auth!, request);
  }

  @Get()
  listSnapshots() {
    return this.modelCatalogService.listSnapshots();
  }

  @Get(':snapshotId')
  getSnapshot(@Param('snapshotId') snapshotId: string) {
    return this.modelCatalogService.getSnapshot(snapshotId);
  }
}
