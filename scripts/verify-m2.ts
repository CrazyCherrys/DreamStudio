import { createServer } from 'node:http';

import { PrismaClient } from '@prisma/client';

const API_BASE_URL = process.env.DREAMSTUDIO_VERIFY_API_URL ?? 'http://127.0.0.1:3001';
const MOCK_NEW_API_PORT = Number.parseInt(
  process.env.DREAMSTUDIO_VERIFY_NEW_API_PORT ?? '3987',
  10,
);
const MOCK_NEW_API_BASE_URL =
  process.env.DREAMSTUDIO_VERIFY_NEW_API_BASE_URL ?? `http://172.20.0.1:${MOCK_NEW_API_PORT}`;
const USERNAME = `m2_user_${Date.now()}`;
const PASSWORD = 'DreamStudioM2!';
const API_KEY = process.env.DREAMSTUDIO_VERIFY_API_KEY ?? `sk-m2-valid-${Date.now()}`;
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';

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
  new_api_config_status: 'missing' | 'untested' | 'valid' | 'invalid';
}

async function main() {
  const server = process.env.DREAMSTUDIO_VERIFY_NEW_API_BASE_URL
    ? null
    : createServer((request, response) => {
        if (request.url === '/v1/models' && request.headers.authorization === `Bearer ${API_KEY}`) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ data: [{ id: 'm2-test-model' }] }));
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
    assert(user.payload.new_api_config_status === 'missing', 'new user starts with missing config');

    await patchSettings(admin.jar, {
      default_new_api_base_url: MOCK_NEW_API_BASE_URL,
      allow_user_custom_new_api_base_url: true,
      registration_enabled: true,
      reference_image_max_mb: 10,
      result_image_max_mb: 25,
    });

    const initialSettings = await get<Record<string, unknown>>('/api/v1/admin/system-settings', admin.jar);
    assert(initialSettings.reference_image_max_mb === 10, 'default reference image max size is returned');
    assert(initialSettings.result_image_max_mb === 25, 'default result image max size is returned');

    const invalid = await post<{ ok: boolean; status: string; error: string | null }>(
      '/api/v1/me/new-api-config/test',
      user.jar,
      { api_key: 'sk-wrong', new_api_base_url: MOCK_NEW_API_BASE_URL },
    );
    assert(invalid.status === 'invalid' && invalid.ok === false, 'wrong key returns invalid');

    const saved = await put<{
      configured: boolean;
      status: string;
      masked_api_key: string | null;
      encrypted_api_key?: string;
    }>('/api/v1/me/new-api-config', user.jar, {
      api_key: API_KEY,
      new_api_base_url: MOCK_NEW_API_BASE_URL,
      test_before_save: true,
    });
    assert(saved.configured && saved.status === 'valid', 'user can save valid new-api config');
    assert(!JSON.stringify(saved).includes(API_KEY), 'save response does not return plaintext key');
    assert(!('encrypted_api_key' in saved), 'save response does not return encrypted field');

    const fetched = await get<Record<string, unknown>>('/api/v1/me/new-api-config', user.jar);
    assert(!JSON.stringify(fetched).includes(API_KEY), 'GET config does not return plaintext key');
    assert(!('encrypted_api_key' in fetched), 'GET config does not return encrypted field');

    const dbConfig = await prisma.userNewApiConfig.findUniqueOrThrow({
      where: {
        userId: user.payload.user.id,
      },
    });
    assert(dbConfig.encryptedApiKey !== API_KEY, 'database encrypted_api_key is not plaintext');
    assert(dbConfig.maskedApiKey !== API_KEY, 'database masked key is not plaintext');

    await patchSettings(admin.jar, {
      default_new_api_base_url: MOCK_NEW_API_BASE_URL,
      allow_user_custom_new_api_base_url: false,
      reference_image_max_mb: 12,
      result_image_max_mb: 30,
    });

    const updatedSettings = await get<Record<string, unknown>>('/api/v1/admin/system-settings', admin.jar);
    assert(updatedSettings.reference_image_max_mb === 12, 'updated reference image max size persists');
    assert(updatedSettings.result_image_max_mb === 30, 'updated result image max size persists');

    const adminSaved = await put<{ status: string }>(
      `/api/v1/admin/users/${user.payload.user.id}/new-api-config`,
      admin.jar,
      {
        api_key: API_KEY,
        test_before_save: true,
      },
    );
    assert(adminSaved.status === 'valid', 'admin can configure user key');

    await del(`/api/v1/admin/users/${user.payload.user.id}/new-api-config`, admin.jar);
    const afterDelete = await prisma.userNewApiConfig.findUnique({
      where: {
        userId: user.payload.user.id,
      },
    });
    assert(!afterDelete, 'admin can clear user key');

    const auditCount = await prisma.auditLog.count({
      where: {
        action: {
          in: ['admin_set_user_new_api_key', 'admin_delete_user_new_api_key'],
        },
        actorUserId: admin.payload.user.id,
        metadata: {
          path: ['api_key'],
          equals: '[redacted]',
        },
      },
    });
    assert(auditCount >= 2, 'admin set/delete writes redacted audit logs');

    const adminMe = await get<AuthPayload>('/api/v1/auth/me', admin.jar);
    assert(adminMe.user.role === 'super_admin', 'super_admin can authenticate for /admin');

    console.log(
      JSON.stringify({
        ok: true,
        user_id: user.payload.user.id,
        checks: [
          'user_save_config',
          'db_key_encrypted',
          'query_no_plaintext',
          'wrong_key_invalid',
          'admin_update_settings',
          'system_settings_image_size_limits',
          'admin_set_delete_user_key',
          'audit_logs_redacted',
          'super_admin_auth',
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
  const response = await request<AuthPayload>('/api/v1/auth/register', {
    method: 'POST',
    body: { username, password, display_name: username },
  });
  return response;
}

async function login(username: string, password: string) {
  return request<AuthPayload>('/api/v1/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

async function patchSettings(jar: CookieJar, body: Record<string, unknown>) {
  return patch('/api/v1/admin/system-settings', jar, body);
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

async function put<T>(path: string, jar: CookieJar, body: Record<string, unknown>) {
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
