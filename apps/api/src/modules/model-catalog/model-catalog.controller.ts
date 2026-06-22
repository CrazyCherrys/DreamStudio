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
import type {
  AiModelBody,
  ExecutionProfileBody,
  ExecutionProfilePreviewBody,
  ExecutionProfileRevisionBody,
  ModelSyncSnapshotBody,
} from './model-catalog.types';

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

  @Get(':modelRecordId/execution-profiles')
  listExecutionProfiles(@Param('modelRecordId') modelRecordId: string) {
    return this.modelCatalogService.listExecutionProfiles(modelRecordId);
  }

  @Post(':modelRecordId/execution-profiles')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  createExecutionProfile(
    @Param('modelRecordId') modelRecordId: string,
    @Body() body: ExecutionProfileBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.createExecutionProfile(
      modelRecordId,
      body,
      request.auth!,
      request,
    );
  }
}

@Controller('admin/execution-profiles')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminExecutionProfilesController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Get(':profileId')
  getExecutionProfile(@Param('profileId') profileId: string) {
    return this.modelCatalogService.getExecutionProfile(profileId);
  }

  @Patch(':profileId')
  @UseGuards(CsrfGuard)
  updateExecutionProfile(
    @Param('profileId') profileId: string,
    @Body() body: ExecutionProfileBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.updateExecutionProfile(profileId, body, request.auth!, request);
  }

  @Delete(':profileId')
  @UseGuards(CsrfGuard)
  deleteExecutionProfile(
    @Param('profileId') profileId: string,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.deleteExecutionProfile(profileId, request.auth!, request);
  }

  @Get(':profileId/revisions')
  listExecutionProfileRevisions(@Param('profileId') profileId: string) {
    return this.modelCatalogService.listExecutionProfileRevisions(profileId);
  }

  @Post(':profileId/revisions')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  createExecutionProfileRevision(
    @Param('profileId') profileId: string,
    @Body() body: ExecutionProfileRevisionBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.createExecutionProfileRevision(
      profileId,
      body,
      request.auth!,
      request,
    );
  }
}

@Controller('admin/execution-profile-revisions')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminExecutionProfileRevisionsController {
  constructor(private readonly modelCatalogService: ModelCatalogService) {}

  @Patch(':revisionId')
  @UseGuards(CsrfGuard)
  updateExecutionProfileRevision(
    @Param('revisionId') revisionId: string,
    @Body() body: ExecutionProfileRevisionBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.updateExecutionProfileRevision(
      revisionId,
      body,
      request.auth!,
      request,
    );
  }

  @Post(':revisionId/preview-request')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  previewExecutionProfileRevision(
    @Param('revisionId') revisionId: string,
    @Body() body: ExecutionProfilePreviewBody,
  ) {
    return this.modelCatalogService.previewExecutionProfileRevision(revisionId, body);
  }

  @Post(':revisionId/lint')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  lintExecutionProfileRevision(@Param('revisionId') revisionId: string) {
    return this.modelCatalogService.lintExecutionProfileRevision(revisionId);
  }

  @Post(':revisionId/test')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  testExecutionProfileRevision(@Param('revisionId') revisionId: string) {
    return this.modelCatalogService.testExecutionProfileRevision(revisionId);
  }

  @Post(':revisionId/activate')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  activateExecutionProfileRevision(
    @Param('revisionId') revisionId: string,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.modelCatalogService.activateExecutionProfileRevision(
      revisionId,
      request.auth!,
      request,
    );
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
