const API_BASE_URL = process.env.DREAMSTUDIO_VERIFY_API_URL ?? 'http://127.0.0.1:3001';
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';

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
  csrf_token: string;
}

interface ModelListPayload {
  items: ModelPayload[];
}

interface ModelPayload {
  id: string;
  model_id: string;
  modality: string;
  default_execution_profile: null | {
    id: string;
    revision_id: string;
    operation: string;
    adapter_key: string;
    adapter_version: string;
    supports_reference_image: boolean;
    max_reference_images: number;
    parameter_schema: unknown[];
    default_params: Record<string, unknown>;
    capabilities: Record<string, unknown>;
  };
}

async function main() {
  const { jar } = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
  const publicModels = await get<ModelListPayload>('/api/v1/models?modality=image', jar);
  const adminModels = await get<ModelListPayload>('/api/v1/admin/models', jar);

  assert(publicModels.items.length > 0, '公共 image 模型列表不能为空');
  for (const model of publicModels.items) {
    assert(model.modality === 'image', '公共模型列表必须按 modality=image 过滤');
    assert(model.default_execution_profile, `${model.model_id} 缺少 default_execution_profile`);
    assert(
      model.default_execution_profile.parameter_schema.length > 0,
      `${model.model_id} default_execution_profile.parameter_schema 不能为空`,
    );
    assert(
      hasQuickSlot(model.default_execution_profile.parameter_schema, 'resolution'),
      `${model.model_id} default_execution_profile.parameter_schema 缺少 ui.slot=resolution`,
    );
  }

  const adminImageModels = adminModels.items.filter((model) => model.modality === 'image');
  assert(adminImageModels.length > 0, 'Admin 模型列表应包含 image 模型');
  assert(
    adminImageModels.some((model) => Boolean(model.default_execution_profile)),
    'Admin 模型列表应显示至少一个可用默认 execution profile',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'public_models_route_returns_default_execution_profile',
          'public_models_route_preserves_profile_schema_ui_slot',
          'admin_models_route_returns_profile_status_source',
        ],
        public_image_models: publicModels.items.map((model) => ({
          id: model.id,
          model_id: model.model_id,
          default_profile_id: model.default_execution_profile?.id,
          active_revision_id: model.default_execution_profile?.revision_id,
        })),
      },
      null,
      2,
    ),
  );
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

function hasQuickSlot(schema: unknown[], slot: string) {
  return schema.some(
    (field) =>
      Boolean(field) &&
      typeof field === 'object' &&
      'ui' in field &&
      Boolean(field.ui) &&
      typeof field.ui === 'object' &&
      'slot' in field.ui &&
      field.ui.slot === slot,
  );
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
