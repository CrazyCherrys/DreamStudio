import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';

import { publicConfigSnapshot } from '@dreamstudio/config';
import { checkPostgres, prisma } from '@dreamstudio/db';
import {
  ASSET_CLEANUP_QUEUE,
  checkRedis,
  createAssetCleanupQueue,
  createBullConnectionOptions,
  createImageGenerationQueue,
  IMAGE_GENERATION_QUEUE,
  withTimeout,
} from '@dreamstudio/queue';

@Controller()
export class HealthController {
  @Get('healthz')
  @HttpCode(200)
  healthz() {
    return {
      status: 'ok',
      module: 'api',
      queues: [IMAGE_GENERATION_QUEUE, ASSET_CLEANUP_QUEUE],
      config: publicConfigSnapshot(),
    };
  }

  @Get('readyz')
  @HttpCode(200)
  async readyz() {
    const [postgres, redis, settings] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      this.checkRequiredRows(),
    ]);
    const queues = redis.ok
      ? await this.checkQueues()
      : { ok: false as const, message: 'Redis unavailable; queue check skipped' };

    const checks = {
      postgres,
      redis,
      queues,
      settings,
    };

    const ok = Object.values(checks).every((check) => check.ok);
    if (!ok) {
      throw new ServiceUnavailableException({
        code: 'not_ready',
        message: 'DreamStudio is not ready',
        details: {
          checks,
        },
      });
    }

    return {
      status: 'ready',
      checks,
    };
  }

  private async checkQueues(): Promise<{ ok: true } | { ok: false; message: string }> {
    const connection = createBullConnectionOptions();
    const imageQueue = createImageGenerationQueue(connection);
    const cleanupQueue = createAssetCleanupQueue(connection);
    try {
      await withTimeout(
        Promise.all([imageQueue.getJobCounts(), cleanupQueue.getJobCounts()]),
        3000,
        'Queue readiness check timed out',
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown queue error',
      };
    } finally {
      await Promise.allSettled([
        withTimeout(imageQueue.close(), 1000, 'Timed out closing image queue'),
        withTimeout(cleanupQueue.close(), 1000, 'Timed out closing cleanup queue'),
      ]);
    }
  }

  private async checkRequiredRows(): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const [systemSettingCount, activeStorageCount] = await Promise.all([
        prisma.systemSetting.count(),
        prisma.storageSetting.count({
          where: {
            isActive: true,
          },
        }),
      ]);

      if (systemSettingCount === 0) {
        return { ok: false, message: 'No system settings have been initialized' };
      }

      if (activeStorageCount === 0) {
        return { ok: false, message: 'No active storage setting has been initialized' };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown settings readiness error',
      };
    }
  }
}
