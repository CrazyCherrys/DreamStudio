import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import multer from 'multer';

import { DEFAULT_MAX_IMAGE_BYTES } from '@dreamstudio/storage';

import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ModelCatalogService } from './model-catalog.service';
import type { AiModelBody, ModelSyncSnapshotBody } from './model-catalog.types';

@Controller('models')
@UseGuards(SessionAuthGuard)
export class PublicModelsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Get()
  listModels(@Query() query: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.modelCatalogService.listPublicModels(query, request.auth!);
  }

  @Get(':modelRecordId')
  getModel(@Param('modelRecordId') modelRecordId: string, @Req() request: AuthenticatedRequest) {
    return this.modelCatalogService.getPublicModel(modelRecordId, request.auth!);
  }

  @Put(':modelRecordId/favorite')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  favoriteModel(
    @Param('modelRecordId') modelRecordId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.modelCatalogService.favoriteModel(modelRecordId, request.auth!);
  }

  @Delete(':modelRecordId/favorite')
  @UseGuards(CsrfGuard)
  unfavoriteModel(
    @Param('modelRecordId') modelRecordId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.modelCatalogService.unfavoriteModel(modelRecordId, request.auth!);
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

@Controller('admin/model-icons')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminModelIconsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: {
        fileSize: DEFAULT_MAX_IMAGE_BYTES,
        files: 1,
      },
    }),
  )
  uploadIcon(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.uploadModelIcon(file, request.auth!, request);
  }
}

@Controller('model-icons')
export class PublicModelIconsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Get(':filename')
  downloadIcon(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.modelCatalogService.downloadModelIcon(filename, response);
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
