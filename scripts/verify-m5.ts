import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

import { DreamStudioSecretCodec } from '@dreamstudio/storage';
import { ImageGenerationService } from '../apps/worker/src/modules/image-generation/image-generation.service';
import { WorkerSystemSettingsService } from '../apps/worker/src/modules/system-settings.service';

const API_BASE_URL = process.env.DREAMSTUDIO_VERIFY_API_URL ?? 'http://127.0.0.1:3001';
const VERIFY_ORIGIN = process.env.APP_BASE_URL ?? 'http://localhost:3000';
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';
const MOCK_NEW_API_PORT = Number.parseInt(
  process.env.DREAMSTUDIO_VERIFY_NEW_API_PORT ?? '3991',
  10,
);
const MOCK_NEW_API_BASE_URL =
  process.env.DREAMSTUDIO_VERIFY_NEW_API_BASE_URL ?? `http://172.20.0.1:${MOCK_NEW_API_PORT}`;
const USERNAME_A = `m5_user_a_${Date.now()}`;
const USERNAME_B = `m5_user_b_${Date.now()}`;
const PASSWORD = 'DreamStudioM5!';
const API_KEY = process.env.DREAMSTUDIO_VERIFY_API_KEY ?? `sk-m5-valid-${Date.now()}`;
const LOCAL_STORAGE_ROOT =
  process.env.DREAMSTUDIO_VERIFY_M5_STORAGE_ROOT ?? `/tmp/dreamstudio-m5-${Date.now()}`;

const prisma = new PrismaClient();

interface CookieJar {
  cookie: string;
  csrfToken: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface AuthPayload {
  user: {
    id: string;
    username: string;
    role: 'user' | 'super_admin';
  };
  csrf_token: string;
}

interface ModelPayload {
  item: {
    id: string;
    model_id: string;
  };
}

interface AssetPayload {
  item: {
    id: string;
    kind: 'reference_image' | 'result_image';
    download_url: string;
  };
}

interface TaskPayload {
  item: {
    id: string;
    status: string;
    error_code: string | null;
    error_message: string | null;
    client_request_id: string | null;
    result_assets: Array<{
      id: string;
      download_url: string;
    }>;
  };
}

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGBgQEABckCAsGZ1kEAAAAASUVORK5CYII=';

async function main() {
  await mkdir(LOCAL_STORAGE_ROOT, { recursive: true });
  const png = await sharp({
    create: {
      width: 5,
      height: 4,
      channels: 4,
      background: '#2563eb',
    },
  })
    .png()
    .toBuffer();

  const server = process.env.DREAMSTUDIO_VERIFY_NEW_API_BASE_URL
    ? null
    : createServer(async (request, response) => handleMockNewApi(request, response, png));

  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.listen(MOCK_NEW_API_PORT, '0.0.0.0', resolve);
  });

  try {
    const admin = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const userA = await register(USERNAME_A, PASSWORD);
    const userB = await register(USERNAME_B, PASSWORD);
    await put('/api/v1/admin/storage-settings', admin.jar, {
      driver: 'local',
      local_input_path: join(LOCAL_STORAGE_ROOT, 'references'),
      local_output_path: join(LOCAL_STORAGE_ROOT, 'results'),
      reference_retention_hours: 1,
      result_retention_hours: 24,
    });
    await patch('/api/v1/admin/system-settings', admin.jar, {
      default_new_api_base_url: MOCK_NEW_API_BASE_URL,
      allow_user_custom_new_api_base_url: true,
      registration_enabled: true,
      reference_image_max_mb: 10,
      result_image_max_mb: 25,
    });

    await put('/api/v1/me/new-api-config', userA.jar, {
      api_key: API_KEY,
      new_api_base_url: MOCK_NEW_API_BASE_URL,
      test_before_save: true,
    });
    await put('/api/v1/me/new-api-config', userB.jar, {
      api_key: API_KEY,
      new_api_base_url: MOCK_NEW_API_BASE_URL,
      test_before_save: true,
    });

    const generationModel = await get<ModelPayload>('/api/v1/models', userA.jar).then((payload) => {
      const item = Array.isArray((payload as unknown as { items?: Array<{ id: string; model_id: string }> }).items)
        ? (payload as unknown as { items: Array<{ id: string; model_id: string }> }).items.find(
            (candidate) => candidate.model_id === 'gpt-image-2',
          )
        : null;
      if (!item) {
        throw new Error('Verification failed: gpt-image-2 public model is unavailable');
      }
      return { item };
    });

    const reference = await uploadReferenceImage(userA.jar, png);
    assert(reference.item.kind === 'reference_image', 'reference upload still works for M5 setup');

    const b64Task = await createTask(userA.jar, generationModel.item.id, 'm5 b64 prompt', {
      size: '1024x1024',
      n: 1,
      quality: 'auto',
      output_format: 'png',
      background: 'auto',
      moderation: 'auto',
    });
    const duplicate = await createTask(
      userA.jar,
      generationModel.item.id,
      'm5 b64 prompt duplicate',
      {
        size: '1024x1024',
        n: 1,
        quality: 'auto',
        output_format: 'png',
        background: 'auto',
        moderation: 'auto',
      },
      b64Task.item.client_request_id!,
    );
    assert(duplicate.item.id === b64Task.item.id, 'client_request_id is idempotent');
    const completedB64 = await runTaskToCompletion(b64Task.item.id);
    assert(completedB64.item.status === 'succeeded', 'mock b64 task succeeds');
    assert(completedB64.item.result_assets.length >= 1, 'mock b64 task creates result asset');

    const urlTask = await createTask(userA.jar, generationModel.item.id, 'm5 url prompt', {
      size: '1024x1024',
      n: 1,
      quality: 'auto',
      output_format: 'png',
      background: 'auto',
      moderation: 'auto',
    });
    const completedUrl = await runTaskToCompletion(urlTask.item.id);
    assert(completedUrl.item.status === 'succeeded', 'mock url task succeeds');
    assert(completedUrl.item.result_assets.length >= 1, 'mock url task creates result asset');

    await patch('/api/v1/admin/system-settings', admin.jar, {
      result_image_max_mb: 1,
    });
    const oversizedResultTask = await createTask(
      userA.jar,
      generationModel.item.id,
      'm5 oversized result prompt',
      {
        size: '1024x1024',
        n: 1,
        quality: 'auto',
        output_format: 'png',
        background: 'auto',
        moderation: 'auto',
      },
    );
    const completedOversized = await runTaskToCompletion(oversizedResultTask.item.id);
    assert(completedOversized.item.status === 'failed', 'oversized result task fails');
    assert(
      completedOversized.item.error_message?.includes('图片不能超过 1MB'),
      'oversized result task reports configured limit',
    );
    await patch('/api/v1/admin/system-settings', admin.jar, {
      result_image_max_mb: 25,
    });

    const resultAssets = await get<{ items: Array<{ id: string; source_task_id: string | null }> }>(
      '/api/v1/assets?kind=result_image',
      userA.jar,
    );
    assert(
      resultAssets.items.some((asset) => asset.source_task_id === completedUrl.item.id) &&
        resultAssets.items.some((asset) => asset.source_task_id === completedB64.item.id),
      '/studio/assets?kind=result_image can list task results',
    );

    const failedTask = await createTask(userA.jar, generationModel.item.id, 'm5 failure prompt', {
      size: '1024x1024',
      n: 1,
      quality: 'auto',
      output_format: 'png',
      background: 'auto',
      moderation: 'auto',
    });
    const completedFailed = await runTaskToCompletion(failedTask.item.id);
    assert(completedFailed.item.status === 'failed', 'upstream failure marks task failed');
    assert(Boolean(completedFailed.item.error_message), 'failed task has readable error summary');

    const canceledTask = await createTask(userA.jar, generationModel.item.id, 'm5 cancel prompt', {
      size: '1024x1024',
      n: 1,
      quality: 'auto',
      output_format: 'png',
      background: 'auto',
      moderation: 'auto',
    });
    const canceled = await post<TaskPayload>(
      `/api/v1/image-tasks/${canceledTask.item.id}/cancel`,
      userA.jar,
      {},
    );
    assert(canceled.item.status === 'canceled', 'pending task can be canceled');

    const retried = await post<TaskPayload>(
      `/api/v1/image-tasks/${completedFailed.item.id}/retry`,
      userA.jar,
      {},
    );
    assert(
      retried.item.id !== completedFailed.item.id && retried.item.status === 'pending',
      'retry creates a new pending task',
    );

    await expectFailure(
      get(`/api/v1/image-tasks/${completedB64.item.id}`, userB.jar),
      'normal user cannot access another user task',
    );

    const requestLogs = await prisma.requestLog.findMany({
      where: {
        userId: userA.payload.user.id,
      },
    });
    assert(requestLogs.length >= 3, 'request logs are written');
    assert(
      !JSON.stringify(requestLogs).includes(API_KEY) &&
        requestLogs.every((log) => log.newApiBaseUrlHost === new URL(MOCK_NEW_API_BASE_URL).host),
      'request logs do not contain plaintext key or full sensitive URL',
    );

    console.log(
      JSON.stringify({
        ok: true,
        checks: [
          'create_task',
          'idempotent_client_request_id',
          'mock_b64_success_result_asset',
          'mock_url_success_result_asset',
          'result_image_max_mb',
          'assets_result_image_listing',
          'upstream_failure_failed_task',
          'pending_cancel',
          'retry_creates_new_task',
          'cross_user_task_404',
          'request_logs_redacted',
        ],
      }),
    );
  } finally {
    await prisma.$disconnect();
    await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true }).catch(() => undefined);
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }
}

async function handleMockNewApi(
  request: IncomingMessage,
  response: ServerResponse,
  urlImageBuffer: Buffer,
) {
  if (request.url === '/v1/models' && request.headers.authorization === `Bearer ${API_KEY}`) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'm5-mock-model' }] }));
    return;
  }
  if (request.url === '/mock-image.png') {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(urlImageBuffer);
    return;
  }
  if (request.url === '/mock-image-large.png') {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(
      await sharp({
        create: {
          width: 2600,
          height: 2600,
          channels: 4,
          noise: {
            type: 'gaussian',
            mean: 128,
            sigma: 60,
          },
        },
      })
        .png()
        .toBuffer(),
    );
    return;
  }
  if (
    request.url === '/v1/images/generations' &&
    request.method === 'POST' &&
    request.headers.authorization === `Bearer ${API_KEY}`
  ) {
    const body = JSON.parse(await readRequestBody(request));
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (prompt.includes('failure')) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'mock invalid image parameters' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: prompt.includes('url')
          ? [{ url: `${MOCK_NEW_API_BASE_URL}/mock-image.png` }]
          : prompt.includes('oversized')
            ? [{ url: `${MOCK_NEW_API_BASE_URL}/mock-image-large.png` }]
            : [{ b64_json: tinyPngBase64 }],
      }),
    );
    return;
  }

  response.writeHead(401, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { message: 'invalid key' } }));
}

async function runTaskToCompletion(taskId: string) {
  const service = new ImageGenerationService(
    new DreamStudioSecretCodec(),
    new WorkerSystemSettingsService(),
  );
  await service.runImageGenerationJob(`verify-m5-${taskId}`, {
    job_version: 1,
    task_id: taskId,
    user_id: '',
    enqueued_at: new Date().toISOString(),
  });
  const task = await prisma.imageTask.findUniqueOrThrow({
    where: {
      id: taskId,
    },
    include: {
      resultAssets: true,
    },
  });
  return get<TaskPayload>(`/api/v1/image-tasks/${task.id}`, await jarForUser(task.userId));
}

async function jarForUser(userId: string): Promise<CookieJar> {
  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id: userId,
    },
  });
  return login(user.username, PASSWORD).then((response) => response.jar);
}

async function createTask(
  jar: CookieJar,
  modelRecordId: string,
  prompt: string,
  parameters: Record<string, unknown>,
  clientRequestId = `m5-${randomBytes(8).toString('hex')}`,
) {
  return post<TaskPayload>('/api/v1/image-tasks', jar, {
    model_record_id: modelRecordId,
    prompt,
    parameters,
    reference_asset_ids: [],
    client_request_id: clientRequestId,
  });
}

async function uploadReferenceImage(jar: CookieJar, buffer: Buffer) {
  const boundary = `----dreamstudio-m5-${randomBytes(8).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n`,
      'utf8',
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  return request<AssetPayload>('/api/v1/assets/reference-images', {
    method: 'POST',
    jar,
    rawBody: body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  }).then((response) => response.payload);
}

async function register(username: string, password: string) {
  return request<AuthPayload>('/api/v1/auth/register', {
    method: 'POST',
    body: { username, password, display_name: username },
  });
}

async function login(username: string, password: string) {
  return request<AuthPayload>('/api/v1/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

async function get<T>(path: string, jar: CookieJar) {
  return request<T>(path, {
    method: 'GET',
    jar,
  }).then((response) => response.payload);
}

async function post<T>(path: string, jar: CookieJar, body: Record<string, unknown>) {
  return request<T>(path, {
    method: 'POST',
    jar,
    body,
  }).then((response) => response.payload);
}

async function put<T = Record<string, unknown>>(
  path: string,
  jar: CookieJar,
  body: Record<string, unknown>,
) {
  return request<T>(path, {
    method: 'PUT',
    jar,
    body,
  }).then((response) => response.payload);
}

async function patch<T = Record<string, unknown>>(
  path: string,
  jar: CookieJar,
  body: Record<string, unknown>,
) {
  return request<T>(path, {
    method: 'PATCH',
    jar,
    body,
  }).then((response) => response.payload);
}

async function expectFailure(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch {
    return;
  }
  throw new Error(`Verification failed: ${message}`);
}

async function request<T>(
  path: string,
  {
    body,
    contentType,
    jar,
    method,
    rawBody,
  }: {
    method: string;
    body?: Record<string, unknown>;
    rawBody?: Buffer;
    contentType?: string;
    jar?: CookieJar;
  },
) {
  const headers: Record<string, string> = {
    accept: 'application/json',
    origin: VERIFY_ORIGIN,
  };

  if (body) {
    headers['content-type'] = 'application/json';
  }
  if (contentType) {
    headers['content-type'] = contentType;
  }
  if (jar) {
    headers.cookie = jar.cookie;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['x-csrf-token'] = jar.csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: rawBody ? new Uint8Array(rawBody) : body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(
      `${method} ${path} failed: ${response.status} ${payload?.error?.code ?? ''} ${
        payload?.error?.message ?? ''
      }`,
    );
  }

  const setCookie = response.headers.get('set-cookie');
  return {
    payload: payload.data,
    jar:
      jar ??
      ({
        cookie: setCookie?.split(';')[0] ?? '',
        csrfToken: (payload.data as AuthPayload).csrf_token,
      } satisfies CookieJar),
  };
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
