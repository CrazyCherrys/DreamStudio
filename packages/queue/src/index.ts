import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

import { loadConfig } from '@dreamstudio/config';

export const IMAGE_GENERATION_QUEUE = 'image-generation';
export const ASSET_CLEANUP_QUEUE = 'asset-cleanup';
export type DreamStudioRedisConnection = IORedis;

export interface ImageGenerationJobPayload {
  job_version: 1;
  task_id: string;
  user_id: string;
  enqueued_at: string;
  client_request_id?: string;
}

export interface AssetCleanupJobPayload {
  job_version: 1;
  asset_kind?: 'reference_image' | 'result_image';
  before: string;
  limit: number;
}

export function createRedisConnection(): DreamStudioRedisConnection {
  const config = loadConfig();
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 3000,
    commandTimeout: 3000,
    lazyConnect: true,
    retryStrategy: () => null,
  });
}

export function createBullConnectionOptions(): ConnectionOptions {
  const config = loadConfig();
  return {
    url: config.redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 3000,
    retryStrategy: () => null,
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function createImageGenerationQueue(connection = createBullConnectionOptions()) {
  return new Queue<ImageGenerationJobPayload>(IMAGE_GENERATION_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

export function createAssetCleanupQueue(connection = createBullConnectionOptions()) {
  return new Queue<AssetCleanupJobPayload>(ASSET_CLEANUP_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

export async function checkRedis(): Promise<{ ok: true } | { ok: false; message: string }> {
  const connection = createRedisConnection();
  connection.on('error', () => undefined);
  try {
    await connection.connect();
    const pong = await withTimeout(connection.ping(), 3000, 'Redis ping timed out');
    return pong === 'PONG'
      ? { ok: true }
      : { ok: false, message: `Unexpected Redis ping: ${pong}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  } finally {
    await connection.quit().catch(() => undefined);
  }
}
