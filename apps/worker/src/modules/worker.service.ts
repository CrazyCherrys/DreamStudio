import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';

import { loadConfig } from '@dreamstudio/config';
import { checkPostgres, prisma } from '@dreamstudio/db';
import {
  ASSET_CLEANUP_QUEUE,
  createAssetCleanupQueue,
  createBullConnectionOptions,
  createImageGenerationQueue,
  IMAGE_GENERATION_QUEUE,
  type AssetCleanupJobPayload,
  type ImageGenerationJobPayload,
} from '@dreamstudio/queue';
import { cleanupAssets, DreamStudioSecretCodec, sanitizeStorageError } from '@dreamstudio/storage';

import { ImageGenerationService } from './image-generation/image-generation.service';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly config = loadConfig();
  private readonly connection = createBullConnectionOptions();
  private imageWorker?: Worker<ImageGenerationJobPayload>;
  private cleanupWorker?: Worker<AssetCleanupJobPayload>;

  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly secretCodec: DreamStudioSecretCodec,
  ) {}

  async onModuleInit() {
    const postgres = await checkPostgres();
    if (!postgres.ok) {
      throw new Error(`Worker cannot reach PostgreSQL: ${postgres.message}`);
    }

    const imageQueue = createImageGenerationQueue(this.connection);
    const cleanupQueue = createAssetCleanupQueue(this.connection);
    await Promise.all([imageQueue.getJobCounts(), cleanupQueue.getJobCounts()]);
    await Promise.all([imageQueue.close(), cleanupQueue.close()]);

    this.imageWorker = new Worker<ImageGenerationJobPayload>(
      IMAGE_GENERATION_QUEUE,
      async (job) => this.imageGenerationService.runImageGenerationJob(job.id, job.data),
      {
        connection: this.connection,
        concurrency: this.config.workerConcurrency,
      },
    );

    this.cleanupWorker = new Worker<AssetCleanupJobPayload>(
      ASSET_CLEANUP_QUEUE,
      async (job) => this.runAssetCleanupJob(job.id, job.data),
      {
        connection: this.connection,
        concurrency: 1,
      },
    );

    for (const worker of [this.imageWorker, this.cleanupWorker]) {
      worker.on('ready', () =>
        console.log(
          JSON.stringify({
            level: 'info',
            module: 'worker',
            event: 'queue_ready',
            queue: worker.name,
          }),
        ),
      );
      worker.on('error', (error) =>
        console.error(
          JSON.stringify({
            level: 'error',
            module: 'worker',
            event: 'queue_error',
            queue: worker.name,
            error: error.message,
          }),
        ),
      );
    }

    console.log(
      JSON.stringify({
        level: 'info',
        module: 'worker',
        event: 'started',
        queues: [IMAGE_GENERATION_QUEUE, ASSET_CLEANUP_QUEUE],
        concurrency: this.config.workerConcurrency,
      }),
    );
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.imageWorker?.close(), this.cleanupWorker?.close()]);
  }

  private async runAssetCleanupJob(jobId: string | undefined, payload: AssetCleanupJobPayload) {
    const startedAt = new Date();
    const cleanupRun = await prisma.cleanupRun.create({
      data: {
        jobType: ASSET_CLEANUP_QUEUE,
        status: 'running',
        startedAt,
      },
    });

    try {
      const result = await cleanupAssets({
        before: new Date(payload.before),
        codec: this.secretCodec,
        kind: payload.asset_kind,
        limit: payload.limit,
      });
      await prisma.cleanupRun.update({
        where: {
          id: cleanupRun.id,
        },
        data: {
          status: result.failedCount > 0 ? 'completed_with_errors' : 'completed',
          finishedAt: new Date(),
          scannedCount: result.scannedCount,
          deletedCount: result.deletedCount,
          failedCount: result.failedCount,
          errorSummary: result.errors.slice(0, 10).join('; ') || null,
        },
      });
      console.log(
        JSON.stringify({
          level: 'info',
          module: 'worker',
          queue: ASSET_CLEANUP_QUEUE,
          event: 'asset_cleanup_completed',
          job_id: jobId,
          cleanup_run_id: cleanupRun.id,
          scanned_count: result.scannedCount,
          deleted_count: result.deletedCount,
          failed_count: result.failedCount,
        }),
      );
    } catch (error) {
      await prisma.cleanupRun.update({
        where: {
          id: cleanupRun.id,
        },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorSummary: sanitizeStorageError(error),
        },
      });
      console.error(
        JSON.stringify({
          level: 'error',
          module: 'worker',
          queue: ASSET_CLEANUP_QUEUE,
          event: 'asset_cleanup_failed',
          job_id: jobId,
          cleanup_run_id: cleanupRun.id,
          error: sanitizeStorageError(error),
        }),
      );
      throw error;
    }
  }
}
