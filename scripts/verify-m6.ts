import { PrismaClient } from '@prisma/client';

import { DreamStudioSecretCodec } from '@dreamstudio/storage';

const API_BASE_URL = process.env.DREAMSTUDIO_VERIFY_API_URL ?? 'http://127.0.0.1:3001';
const VERIFY_ORIGIN = process.env.APP_BASE_URL ?? 'http://localhost:3000';
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';
const USERNAME = `m6_user_${Date.now()}`;
const PASSWORD = 'DreamStudioM6!';
const NEW_PASSWORD = 'DreamStudioM6Reset!';
const FULL_PROMPT = `m6 verify full prompt ${Date.now()}`;
const FULL_PARAMS = {
  size: '1024x1024',
  n: 1,
  style: 'verify-m6',
};
const MODEL_RECORD_ID = '00000000-0000-4000-8000-00000000a601';

const prisma = new PrismaClient();
const codec = new DreamStudioSecretCodec();

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

async function main() {
  const admin = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
  const normal = await register(USERNAME, PASSWORD);
  const oldUserJar = normal.jar;

  await patch(`/api/v1/admin/users/${normal.payload.user.id}/status`, admin.jar, {
    status: 'disabled',
  });

  await expectFailure(get('/api/v1/auth/me', oldUserJar), 'disabled user old session is rejected');

  await patch(`/api/v1/admin/users/${normal.payload.user.id}/status`, admin.jar, {
    status: 'active',
  });

  const reloggedOldPassword = await login(USERNAME, PASSWORD);
  await post(`/api/v1/admin/users/${normal.payload.user.id}/reset-password`, admin.jar, {
    new_password: NEW_PASSWORD,
  });

  await expectFailure(login(USERNAME, PASSWORD), 'old password is rejected after admin reset');
  await expectFailure(
    get('/api/v1/auth/me', reloggedOldPassword.jar),
    'password reset revokes old sessions',
  );
  const resetLogin = await login(USERNAME, NEW_PASSWORD);
  assert(resetLogin.payload.user.id === normal.payload.user.id, 'new password can log in');

  const requestLog = await seedRequestLog(normal.payload.user.id);

  const requestLogs = await get<{ items: Array<{ id: string; prompt_summary: string | null }> }>(
    `/api/v1/admin/request-logs?user_id=${normal.payload.user.id}&keyword=m6`,
    admin.jar,
  );
  assert(
    requestLogs.items.some((item) => item.id === requestLog.id),
    'request log list can query seeded request log',
  );
  assert(
    !JSON.stringify(requestLogs).includes(FULL_PROMPT),
    'request log list does not return full prompt',
  );

  const detail = await get<{
    item: {
      id: string;
      prompt_summary: string | null;
      sanitized_params: unknown;
      has_prompt: boolean;
      has_params: boolean;
    };
  }>(`/api/v1/admin/request-logs/${requestLog.id}`, admin.jar);
  assert(
    detail.item.has_prompt && detail.item.has_params,
    'request log detail marks revealable data',
  );
  assert(
    !JSON.stringify(detail).includes(FULL_PROMPT) && !JSON.stringify(detail).includes('style'),
    'request log detail defaults to summary and sanitized params',
  );

  const revealedPrompt = await post<{ prompt: string }>(
    `/api/v1/admin/request-logs/${requestLog.id}/reveal-prompt`,
    admin.jar,
    {},
  );
  assert(revealedPrompt.prompt === FULL_PROMPT, 'reveal prompt returns full prompt');

  const revealedParams = await post<{ params: typeof FULL_PARAMS }>(
    `/api/v1/admin/request-logs/${requestLog.id}/reveal-params`,
    admin.jar,
    {},
  );
  assert(
    revealedParams.params.size === FULL_PARAMS.size &&
      revealedParams.params.style === FULL_PARAMS.style,
    'reveal params returns full params',
  );

  const auditLogs = await get<{
    items: Array<{ action: string; target_id: string | null; metadata: unknown }>;
  }>(`/api/v1/admin/audit-logs?actor_user_id=${admin.payload.user.id}`, admin.jar);
  const actions = auditLogs.items.map((item) => item.action);
  assert(actions.includes('admin_disable_user'), 'audit log includes user disable');
  assert(actions.includes('admin_enable_user'), 'audit log includes user enable');
  assert(actions.includes('admin_reset_user_password'), 'audit log includes password reset');
  assert(actions.includes('admin_reveal_request_log_prompt'), 'audit log includes prompt reveal');
  assert(actions.includes('admin_reveal_request_log_params'), 'audit log includes params reveal');
  assert(!JSON.stringify(auditLogs).includes(FULL_PROMPT), 'audit logs do not include full prompt');

  await expectFailure(
    get('/api/v1/admin/request-logs', resetLogin.jar),
    'normal user cannot access request logs',
  );
  await expectFailure(
    get('/api/v1/admin/audit-logs', resetLogin.jar),
    'normal user cannot access audit logs',
  );
  await expectFailure(
    get('/api/v1/admin/users', resetLogin.jar),
    'normal user cannot access user management',
  );

  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        'admin_login',
        'create_normal_user',
        'disable_revokes_old_session',
        'enable_user',
        'reset_password_revokes_session',
        'old_password_rejected',
        'new_password_login',
        'request_log_list_query',
        'request_log_detail_redacted',
        'reveal_prompt_audited',
        'reveal_params_audited',
        'audit_log_list_query',
        'normal_user_admin_denied',
      ],
    }),
  );
}

async function seedRequestLog(userId: string) {
  const category = await prisma.modelCategory.upsert({
    where: {
      slug: 'm6-verify-images',
    },
    create: {
      name: 'M6 Verify Images',
      slug: 'm6-verify-images',
      sortOrder: -9000,
      isEnabled: true,
    },
    update: {
      deletedAt: null,
      isEnabled: true,
    },
  });
  const model = await prisma.aiModel.upsert({
    where: {
      id: MODEL_RECORD_ID,
    },
    create: {
      id: MODEL_RECORD_ID,
      categoryId: category.id,
      modelId: `m6-verify-model-${Date.now()}`,
      displayName: 'M6 Verify Model',
      providerName: 'Verify',
      endpointType: 'openai_image_generations',
      referenceTransferMode: 'none',
      supportsReferenceImage: false,
      isEnabled: true,
      isRecommended: false,
      sortOrder: -9000,
      defaultParams: {},
      parameterSchema: [],
    },
    update: {
      categoryId: category.id,
      deletedAt: null,
      isEnabled: true,
    },
  });
  const encryptedPrompt = codec.encryptSecret(FULL_PROMPT);
  const encryptedParams = codec.encryptSecret(JSON.stringify(FULL_PARAMS));
  const task = await prisma.imageTask.create({
    data: {
      userId,
      modelRecordId: model.id,
      modelIdSnapshot: model.modelId,
      endpointTypeSnapshot: 'openai_image_generations',
      newApiBaseUrlSnapshot: 'https://new-api.example.test/private/path?token=redacted',
      promptSummary: 'm6 verify prompt summary',
      encryptedPrompt: encryptedPrompt.encrypted,
      promptIv: encryptedPrompt.iv,
      promptTag: encryptedPrompt.tag,
      parameterSnapshot: FULL_PARAMS,
      sanitizedParameterSnapshot: {
        size: FULL_PARAMS.size,
        n: FULL_PARAMS.n,
      },
      status: 'succeeded',
      completedAt: new Date(),
    },
  });
  const attempt = await prisma.imageTaskAttempt.create({
    data: {
      taskId: task.id,
      attemptNo: 1,
      status: 'succeeded',
      startedAt: new Date(),
      finishedAt: new Date(),
      httpStatus: 200,
    },
  });

  return prisma.requestLog.create({
    data: {
      userId,
      taskId: task.id,
      attemptId: attempt.id,
      newApiBaseUrlHost: 'new-api.example.test',
      modelId: task.modelIdSnapshot,
      endpointType: task.endpointTypeSnapshot,
      status: 'succeeded',
      httpStatus: 200,
      durationMs: 123,
      promptSummary: task.promptSummary,
      encryptedPrompt: encryptedPrompt.encrypted,
      promptIv: encryptedPrompt.iv,
      promptTag: encryptedPrompt.tag,
      sanitizedParams: {
        size: FULL_PARAMS.size,
        n: FULL_PARAMS.n,
      },
      encryptedParams: encryptedParams.encrypted,
      paramsIv: encryptedParams.iv,
      paramsTag: encryptedParams.tag,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
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
    origin: VERIFY_ORIGIN,
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
