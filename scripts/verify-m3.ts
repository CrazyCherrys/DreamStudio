import { createServer } from 'node:http';

import { PrismaClient } from '@prisma/client';

const API_BASE_URL = process.env.DREAMSTUDIO_VERIFY_API_URL ?? 'http://127.0.0.1:3001';
const MOCK_NEW_API_PORT = Number.parseInt(
  process.env.DREAMSTUDIO_VERIFY_NEW_API_PORT ?? '3989',
  10,
);
const MOCK_NEW_API_BASE_URL =
  process.env.DREAMSTUDIO_VERIFY_NEW_API_BASE_URL ?? `http://172.20.0.1:${MOCK_NEW_API_PORT}`;
const TEMP_API_KEY = process.env.DREAMSTUDIO_VERIFY_API_KEY ?? `sk-m3-temp-${Date.now()}`;
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';
const USERNAME = `m3_user_${Date.now()}`;
const PASSWORD = 'DreamStudioM3!';

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

interface CategoryPayload {
  item: {
    id: string;
    name: string;
    slug: string;
    is_enabled: boolean;
    deleted_at: string | null;
  };
}

interface ModelPayload {
  item: {
    id: string;
    model_id: string;
    display_name: string;
    is_enabled: boolean;
    deleted_at: string | null;
    parameter_schema: Array<Record<string, unknown>>;
  };
}

interface ListPayload<T> {
  items: T[];
}

interface SnapshotCreatePayload {
  snapshot: {
    id: string;
    base_url: string;
    model_count: number;
  };
}

interface SnapshotDetailPayload extends SnapshotCreatePayload {
  snapshot: SnapshotCreatePayload['snapshot'] & {
    raw_response: unknown;
  };
}

const validSchema = [
  {
    key: 'size',
    label: '尺寸',
    type: 'select',
    required: true,
    default: '1024x1024',
    options: [
      { label: '1024 x 1024', value: '1024x1024' },
      { label: '1536 x 1024', value: '1536x1024' },
    ],
  },
  {
    key: 'n',
    label: '数量',
    type: 'integer',
    required: true,
    default: 1,
    min: 1,
    max: 4,
  },
  {
    key: 'transparent_background',
    label: '透明背景',
    type: 'boolean',
    required: false,
    default: false,
  },
] as const;

async function main() {
  const server = process.env.DREAMSTUDIO_VERIFY_NEW_API_BASE_URL
    ? null
    : createServer((request, response) => {
        if (
          request.url === '/v1/models' &&
          request.headers.authorization === `Bearer ${TEMP_API_KEY}`
        ) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              object: 'list',
              data: [{ id: 'm3-candidate-a' }, { id: 'm3-candidate-b' }],
            }),
          );
          return;
        }

        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'invalid key' } }));
      });

  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.listen(MOCK_NEW_API_PORT, '0.0.0.0', resolve);
  });

  try {
    const admin = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const user = await register(USERNAME, PASSWORD);

    const activeCategory = await post<CategoryPayload>(
      '/api/v1/admin/model-categories',
      admin.jar,
      {
        name: 'M3 通用绘画',
        slug: `m3-general-${Date.now()}`,
        icon: 'palette',
        sort_order: 10,
        is_enabled: true,
      },
    );
    const disabledCategory = await post<CategoryPayload>(
      '/api/v1/admin/model-categories',
      admin.jar,
      {
        name: 'M3 禁用分类',
        slug: `m3-disabled-${Date.now()}`,
        sort_order: 99,
        is_enabled: false,
      },
    );

    const renamedCategory = await patch<CategoryPayload>(
      `/api/v1/admin/model-categories/${activeCategory.item.id}`,
      admin.jar,
      {
        name: 'M3 通用绘画已编辑',
        sort_order: 12,
      },
    );
    assert(renamedCategory.item.name.endsWith('已编辑'), 'admin can edit category');
    await del(`/api/v1/admin/model-categories/${disabledCategory.item.id}`, admin.jar);
    const deletedCategory = await prisma.modelCategory.findUniqueOrThrow({
      where: { id: disabledCategory.item.id },
    });
    assert(Boolean(deletedCategory.deletedAt), 'admin soft deletes category');

    const modelId = `m3-gpt-image-${Date.now()}`;
    const activeModel = await post<ModelPayload>('/api/v1/admin/models', admin.jar, {
      category_id: activeCategory.item.id,
      model_id: modelId,
      display_name: 'M3 GPT Image',
      provider_name: 'OpenAI',
      endpoint_type: 'openai_image_generations',
      reference_transfer_mode: 'none',
      supports_reference_image: false,
      is_enabled: true,
      is_recommended: true,
      sort_order: 10,
      default_params: {
        size: '1024x1024',
        n: 1,
        transparent_background: false,
      },
      parameter_schema: validSchema,
    });
    assert(activeModel.item.parameter_schema.length === 3, 'valid parameter_schema can save');

    const editedModel = await patch<ModelPayload>(
      `/api/v1/admin/models/${activeModel.item.id}`,
      admin.jar,
      {
        display_name: 'M3 GPT Image 已编辑',
        is_recommended: false,
      },
    );
    assert(editedModel.item.display_name.endsWith('已编辑'), 'admin can edit model');

    await expectFailure(
      post<ModelPayload>('/api/v1/admin/models', admin.jar, {
        category_id: activeCategory.item.id,
        model_id: modelId,
        display_name: 'Duplicate',
        endpoint_type: 'openai_image_generations',
        reference_transfer_mode: 'none',
        supports_reference_image: false,
        is_enabled: true,
        is_recommended: false,
        sort_order: 20,
        default_params: {},
        parameter_schema: [],
      }),
      'duplicate active model is rejected',
    );

    const disabledModel = await post<ModelPayload>('/api/v1/admin/models', admin.jar, {
      category_id: activeCategory.item.id,
      model_id: `${modelId}-disabled`,
      display_name: 'M3 Disabled',
      endpoint_type: 'openai_image_generations',
      reference_transfer_mode: 'none',
      supports_reference_image: false,
      is_enabled: false,
      is_recommended: false,
      sort_order: 30,
      default_params: {},
      parameter_schema: [],
    });

    await expectFailure(
      post<ModelPayload>('/api/v1/admin/models', admin.jar, {
        category_id: activeCategory.item.id,
        model_id: `${modelId}-invalid-schema`,
        display_name: 'Invalid Schema',
        endpoint_type: 'openai_image_generations',
        reference_transfer_mode: 'none',
        supports_reference_image: false,
        is_enabled: true,
        is_recommended: false,
        sort_order: 40,
        default_params: { rogue: true },
        parameter_schema: validSchema,
      }),
      'undeclared default param is rejected',
    );

    await del(`/api/v1/admin/models/${disabledModel.item.id}`, admin.jar);
    const deletedModel = await prisma.aiModel.findUniqueOrThrow({
      where: { id: disabledModel.item.id },
    });
    assert(Boolean(deletedModel.deletedAt), 'admin soft deletes model');

    const publicCategories = await get<ListPayload<{ id: string }>>(
      '/api/v1/model-categories',
      user.jar,
    );
    assert(
      publicCategories.items.some((category) => category.id === activeCategory.item.id),
      'active category visible to normal user',
    );
    assert(
      publicCategories.items.every((category) => category.id !== disabledCategory.item.id),
      'deleted or disabled category hidden from normal user',
    );

    const publicModels = await get<ListPayload<{ id: string; parameter_schema: unknown[] }>>(
      '/api/v1/models',
      user.jar,
    );
    assert(
      publicModels.items.some((model) => model.id === activeModel.item.id),
      'active model visible to normal user',
    );
    assert(
      publicModels.items.every((model) => model.id !== disabledModel.item.id),
      'disabled model hidden from normal user',
    );
    assert(
      publicModels.items.some(
        (model) => model.id === activeModel.item.id && model.parameter_schema.length === 3,
      ),
      'public model exposes parameter_schema for studio rendering',
    );

    const snapshot = await post<SnapshotCreatePayload>(
      '/api/v1/admin/model-sync-snapshots',
      admin.jar,
      {
        new_api_base_url: MOCK_NEW_API_BASE_URL,
        api_key: TEMP_API_KEY,
      },
    );
    assert(snapshot.snapshot.model_count === 2, 'snapshot pulls model candidates');

    const snapshotDetail = await get<SnapshotDetailPayload>(
      `/api/v1/admin/model-sync-snapshots/${snapshot.snapshot.id}`,
      admin.jar,
    );
    assert(
      JSON.stringify(snapshotDetail.snapshot.raw_response).includes('m3-candidate-a'),
      'snapshot raw_response is saved',
    );

    const publicModelsAfterSnapshot = await get<ListPayload<{ model_id: string }>>(
      '/api/v1/models',
      user.jar,
    );
    assert(
      publicModelsAfterSnapshot.items.every((model) => model.model_id !== 'm3-candidate-a'),
      'candidate models are not automatically public models',
    );

    const snapshotRow = await prisma.modelSyncSnapshot.findUniqueOrThrow({
      where: { id: snapshot.snapshot.id },
    });
    const leakedSnapshot = JSON.stringify(snapshotRow).includes(TEMP_API_KEY);
    const leakedAuditCount = await prisma.auditLog.count({
      where: {
        targetId: snapshot.snapshot.id,
        metadata: {
          path: ['api_key'],
          equals: TEMP_API_KEY,
        },
      },
    });
    assert(!leakedSnapshot, 'temporary api_key is not persisted in snapshot row');
    assert(leakedAuditCount === 0, 'temporary api_key is not stored in audit metadata');

    console.log(
      JSON.stringify({
        ok: true,
        checks: [
          'admin_category_crud_soft_delete',
          'admin_model_crud_soft_delete',
          'active_model_unique',
          'public_visibility',
          'disabled_hidden',
          'parameter_schema_valid_saved',
          'parameter_schema_invalid_rejected',
          'snapshot_raw_response_saved',
          'candidates_not_public',
          'temporary_key_not_persisted',
        ],
      }),
    );
  } finally {
    await prisma.$disconnect();
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }
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

async function patch<T>(path: string, jar: CookieJar, body: Record<string, unknown>) {
  return request<T>(path, {
    method: 'PATCH',
    jar,
    body,
  }).then((response) => response.payload);
}

async function del<T = Record<string, unknown>>(path: string, jar: CookieJar) {
  return request<T>(path, {
    method: 'DELETE',
    jar,
  }).then((response) => response.payload);
}

async function request<T>(
  path: string,
  {
    body,
    jar,
    method,
  }: {
    method: string;
    body?: Record<string, unknown>;
    jar?: CookieJar;
  },
) {
  const headers: Record<string, string> = {
    accept: 'application/json',
    origin: 'http://localhost:3000',
  };

  if (body) {
    headers['content-type'] = 'application/json';
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
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(
      `${method} ${path} failed: ${response.status} ${payload.error?.code ?? ''} ${
        payload.error?.message ?? ''
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

async function expectFailure(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch {
    return;
  }

  throw new Error(`Verification failed: ${message}`);
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
