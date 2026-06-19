import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';

import { loadConfig } from '@dreamstudio/config';
import { checkPostgres } from '@dreamstudio/db';
import {
  ASSET_CLEANUP_QUEUE,
  createAssetCleanupQueue,
  createBullConnectionOptions,
  createImageGenerationQueue,
  IMAGE_GENERATION_QUEUE,
  type AssetCleanupJobPayload,
  type ImageGenerationJobPayload,
} from '@dreamstudio/queue';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly config = loadConfig();
  private readonly connection = createBullConnectionOptions();
  private imageWorker?: Worker<ImageGenerationJobPayload>;
  private cleanupWorker?: Worker<AssetCleanupJobPayload>;

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
      async (job) => {
        console.log(
          JSON.stringify({
            level: 'info',
            module: 'worker',
            queue: IMAGE_GENERATION_QUEUE,
            event: 'placeholder_job_received',
            job_id: job.id,
            task_id: job.data.task_id,
          }),
        );
      },
      {
        connection: this.connection,
        concurrency: this.config.workerConcurrency,
      },
    );

    this.cleanupWorker = new Worker<AssetCleanupJobPayload>(
      ASSET_CLEANUP_QUEUE,
      async (job) => {
        console.log(
          JSON.stringify({
            level: 'info',
            module: 'worker',
            queue: ASSET_CLEANUP_QUEUE,
            event: 'placeholder_job_received',
            job_id: job.id,
            asset_kind: job.data.asset_kind,
          }),
        );
      },
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
}
