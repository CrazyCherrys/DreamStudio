import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import multer from 'multer';

import { DEFAULT_MAX_IMAGE_BYTES } from '@dreamstudio/storage';

import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AdminStorageSettingsService } from './admin-storage-settings.service';
import { AssetsService } from './assets.service';
import type { AssetListQuery, BatchDeleteAssetsBody, StorageSettingsBody } from './storage.types';

@Controller('assets')
@UseGuards(SessionAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('reference-images')
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
  uploadReferenceImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.assetsService.uploadReferenceImage(file, request.auth!);
  }

  @Get()
  listAssets(@Query() query: AssetListQuery, @Req() request: AuthenticatedRequest) {
    return this.assetsService.listAssets(query, request.auth!);
  }

  @Post('batch-delete')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  batchDeleteAssets(@Body() body: BatchDeleteAssetsBody, @Req() request: AuthenticatedRequest) {
    return this.assetsService.batchDeleteAssets(body, request.auth!);
  }

  @Get('download/:assetId')
  downloadAsset(
    @Param('assetId') assetId: string,
    @Req() request: AuthenticatedRequest & Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.assetsService.downloadAsset(
      request.originalUrl || assetId,
      request.auth!,
      response,
    );
  }
}

@Controller('assets/:assetId')
@UseGuards(SessionAuthGuard)
export class AssetItemController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('download')
  downloadAsset(
    @Param('assetId') assetId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.assetsService.downloadAsset(assetId, request.auth!, response);
  }

  @Get()
  getAsset(
    @Param('assetId') assetId: string,
    @Req() request: AuthenticatedRequest & Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (request.originalUrl.includes('/download') || assetId.includes('/download')) {
      return this.assetsService.downloadAsset(request.originalUrl, request.auth!, response);
    }
    return this.assetsService.getAsset(assetId, request.auth!);
  }

  @Delete()
  @UseGuards(CsrfGuard)
  deleteAsset(@Param('assetId') assetId: string, @Req() request: AuthenticatedRequest) {
    return this.assetsService.deleteAsset(assetId, request.auth!);
  }
}

@Controller('admin/storage-settings')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminStorageSettingsController {
  constructor(private readonly adminStorageSettingsService: AdminStorageSettingsService) {}

  @Get()
  getSettings() {
    return this.adminStorageSettingsService.getSettings();
  }

  @Put()
  @UseGuards(CsrfGuard)
  updateSettings(
    @Body() body: StorageSettingsBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.adminStorageSettingsService.updateSettings(body, request.auth!, request);
  }

  @Post('test')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  testSettings(@Body() body: StorageSettingsBody, @Req() request: AuthenticatedRequest & Request) {
    return this.adminStorageSettingsService.testSettings(body, request.auth!, request);
  }
}
