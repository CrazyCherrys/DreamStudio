import { HttpStatus, Injectable, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AssetKind, type Asset } from '@prisma/client';

import { megabytesToBytes } from '@dreamstudio/config';
import { prisma } from '@dreamstudio/db';
import {
  assetDownloadPath,
  deletePhysicalAsset,
  openDownloadObject,
  sanitizeStorageError,
  StorageValidationError,
  uploadImageObject,
} from '@dreamstudio/storage';

import { apiError, validationFailed } from '../auth/auth.errors';
import type { SessionContext } from '../auth/auth.types';
import { EncryptionService } from '../new-api-config/encryption.service';
import { SystemSettingsService } from '../new-api-config/system-settings.service';
import type { AssetListQuery, BatchDeleteAssetsBody } from './storage.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_EXTRACT_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

@Injectable()
export class AssetsService {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async uploadReferenceImage(file: Express.Multer.File | undefined, session: SessionContext) {
    if (!file) {
      throw validationFailed([{ field: 'file', message: '请选择图片文件' }]);
    }

    try {
      const maxBytes = megabytesToBytes(
        await this.systemSettingsService.getNumber('reference_image_max_mb', 10),
      );
      const stored = await uploadImageObject({
        buffer: file.buffer,
        codec: this.encryptionService,
        kind: 'reference_image',
        maxBytes,
        originalFilename: file.originalname,
        userId: session.userId,
      });
      const asset = await prisma.asset.create({
        data: {
          userId: session.userId,
          kind: 'reference_image',
          status: 'available',
          storageDriver: stored.storageDriver,
          bucket: stored.bucket,
          objectKey: stored.objectKey,
          filename: stored.filename,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          width: stored.width,
          height: stored.height,
          checksum: stored.checksum,
          expiresAt: stored.expiresAt,
        },
      });

      return {
        item: this.serializeAsset(asset),
      };
    } catch (error) {
      if (error instanceof StorageValidationError) {
        throw validationFailed([{ field: error.field, message: error.message }]);
      }
      throw apiError(HttpStatus.BAD_REQUEST, 'asset_upload_failed', '图片上传失败');
    }
  }

  async listAssets(query: AssetListQuery, session: SessionContext) {
    const kind = this.readKind(query.kind, 'result_image');
    const page = this.readPositiveInt(query.page, 1, 1, 100000);
    const pageSize = this.readPositiveInt(query.page_size, 24, 1, 100);
    const where = {
      userId: session.userId,
      kind,
      status: 'available' as const,
      deletedAt: null,
    };
    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.asset.count({
        where,
      }),
    ]);

    return {
      items: items.map((asset) => this.serializeAsset(asset)),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async getAsset(assetId: string, session: SessionContext) {
    const asset = await this.findOwnAsset(assetId, session);
    return {
      item: this.serializeAsset(asset),
    };
  }

  async downloadAsset(assetId: string, session: SessionContext, response: Response) {
    const asset = await this.findOwnAsset(this.normalizeDownloadAssetId(assetId), session);
    try {
      const download = await openDownloadObject(asset, this.encryptionService);
      response.setHeader('cache-control', 'private, no-store');
      response.setHeader('content-type', download.contentType);
      response.setHeader('content-disposition', this.contentDisposition(download.filename));
      if (download.contentLength !== undefined) {
        response.setHeader('content-length', String(download.contentLength));
      }
      return new StreamableFile(download.stream);
    } catch {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '资产文件不可用');
    }
  }

  async deleteAsset(assetId: string, session: SessionContext) {
    const asset = await this.findOwnAsset(assetId, session);
    const deleted = await this.softDeleteWithPhysicalAttempt(asset);
    return {
      deleted: true,
      physical_deleted: deleted,
    };
  }

  async batchDeleteAssets(body: BatchDeleteAssetsBody, session: SessionContext) {
    if (!Array.isArray(body.asset_ids) || body.asset_ids.length === 0) {
      throw validationFailed([{ field: 'asset_ids', message: '请选择要删除的资产' }]);
    }

    const ids = [...new Set(body.asset_ids.filter((id): id is string => typeof id === 'string'))];
    if (ids.length !== body.asset_ids.length || ids.some((id) => !UUID_PATTERN.test(id))) {
      throw validationFailed([{ field: 'asset_ids', message: '资产 ID 格式错误' }]);
    }

    const assets = await prisma.asset.findMany({
      where: {
        id: {
          in: ids,
        },
        userId: session.userId,
        status: 'available',
        deletedAt: null,
      },
    });
    if (assets.length !== ids.length) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '资产不存在');
    }

    let physicalDeleted = 0;
    for (const asset of assets) {
      if (await this.softDeleteWithPhysicalAttempt(asset)) {
        physicalDeleted += 1;
      }
    }

    return {
      deleted_count: assets.length,
      physical_deleted_count: physicalDeleted,
    };
  }

  private async findOwnAsset(assetId: string, session: SessionContext) {
    this.assertUuid(assetId, 'asset_id');
    const asset = await prisma.asset.findFirst({
      where: {
        id: assetId,
        userId: session.userId,
        status: 'available',
        deletedAt: null,
      },
    });
    if (!asset) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '资产不存在');
    }
    return asset;
  }

  private async softDeleteWithPhysicalAttempt(asset: Asset) {
    let physicalDeleted = false;
    let sanitizedError: string | null = null;
    try {
      physicalDeleted = await deletePhysicalAsset(asset, this.encryptionService);
    } catch (error) {
      sanitizedError = sanitizeStorageError(error);
      physicalDeleted = false;
    }

    await prisma.asset.update({
      where: {
        id: asset.id,
      },
      data: {
        status: physicalDeleted ? 'expired_cleaned' : 'deleted',
        deletedAt: new Date(),
        cleanedAt: physicalDeleted ? new Date() : null,
        needsPhysicalDelete: !physicalDeleted,
      },
    });

    if (sanitizedError) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          module: 'api',
          event: 'asset_physical_delete_failed',
          asset_id: asset.id,
          asset_kind: asset.kind,
          error: sanitizedError,
        }),
      );
    }

    return physicalDeleted;
  }

  private serializeAsset(asset: Asset) {
    return {
      id: asset.id,
      kind: asset.kind,
      status: asset.status,
      filename: asset.filename,
      mime_type: asset.mimeType,
      size_bytes: asset.sizeBytes.toString(),
      width: asset.width,
      height: asset.height,
      checksum: asset.checksum,
      source_task_id: asset.sourceTaskId,
      created_at: asset.createdAt.toISOString(),
      updated_at: asset.updatedAt.toISOString(),
      deleted_at: asset.deletedAt?.toISOString() ?? null,
      expires_at: asset.expiresAt?.toISOString() ?? null,
      cleaned_at: asset.cleanedAt?.toISOString() ?? null,
      download_url: assetDownloadPath(asset.id),
    };
  }

  private readKind(value: unknown, fallback: AssetKind) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    if (value === 'reference_image' || value === 'result_image') {
      return value;
    }
    throw validationFailed([{ field: 'kind', message: '资产类型无效' }]);
  }

  private readPositiveInt(value: unknown, fallback: number, min: number, max: number) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return fallback;
    }
    return parsed;
  }

  private assertUuid(value: string, field: string) {
    if (!UUID_PATTERN.test(value)) {
      throw validationFailed([{ field, message: 'ID 格式错误' }]);
    }
  }

  private normalizeDownloadAssetId(value: string) {
    return value.match(UUID_EXTRACT_PATTERN)?.[0] ?? value;
  }

  private contentDisposition(filename: string) {
    const ascii = filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
}
