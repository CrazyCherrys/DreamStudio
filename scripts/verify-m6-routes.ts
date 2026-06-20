import { createRequire } from 'node:module';

import { PrismaClient } from '@prisma/client';

import { DreamStudioSecretCodec } from '@dreamstudio/storage';

const require = createRequire(__filename);
const playwrightPath =
  process.env.PLAYWRIGHT_PACKAGE_PATH ?? '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = require(playwrightPath) as typeof import('playwright');

const WEB_BASE_URL = process.env.DREAMSTUDIO_VERIFY_WEB_URL ?? 'http://127.0.0.1:3000';
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';
const ROUTE_USER_ID =
  process.env.DREAMSTUDIO_VERIFY_ROUTE_USER_ID ?? '00000000-0000-4000-8000-00000000a602';
const ROUTE_MODEL_ID =
  process.env.DREAMSTUDIO_VERIFY_ROUTE_MODEL_ID ?? '00000000-0000-4000-8000-00000000a603';

const prisma = new PrismaClient();
const codec = new DreamStudioSecretCodec();

async function main() {
  const seeded = await seedRouteData();
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
      '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
  });

  try {
    const page = await browser.newPage();
    await page.goto(`${WEB_BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('用户名').fill(ADMIN_USERNAME);
    await page.getByLabel('密码').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForURL('**/admin', { timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/admin/users`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '用户管理' }).waitFor({ timeout: 10000 });
    await page.getByText(seeded.user.username, { exact: true }).waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/admin/users/${seeded.user.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: seeded.user.username }).waitFor({ timeout: 10000 });
    await page.getByRole('heading', { name: '会话摘要' }).waitFor({ timeout: 10000 });
    await page.getByRole('heading', { name: '重置密码' }).waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/admin/request-logs`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '请求日志' }).waitFor({ timeout: 10000 });
    await page.getByText('m6 route prompt summary', { exact: true }).waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/admin/request-logs/${seeded.requestLog.id}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: seeded.model.modelId }).waitFor({ timeout: 10000 });
    await page.getByRole('heading', { name: '敏感内容 Reveal' }).waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/admin/audit-logs`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '审计日志' }).waitFor({ timeout: 10000 });
    await page.getByText('M6 route audit marker', { exact: false }).waitFor({ timeout: 10000 });

    console.log(
      JSON.stringify({
        ok: true,
        checks: [
          'admin_users_route',
          'admin_user_detail_route',
          'admin_request_logs_route',
          'admin_request_log_detail_route',
          'admin_audit_logs_route',
        ],
      }),
    );
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function seedRouteData() {
  const admin = await prisma.user.findFirstOrThrow({
    where: {
      username: ADMIN_USERNAME,
      role: 'super_admin',
      status: 'active',
    },
  });
  const passwordHash = admin.passwordHash;
  const user = await prisma.user.upsert({
    where: {
      id: ROUTE_USER_ID,
    },
    create: {
      id: ROUTE_USER_ID,
      username: `m6_route_user_${Date.now()}`,
      displayName: 'M6 Route User',
      passwordHash,
      role: 'user',
      status: 'active',
    },
    update: {
      displayName: 'M6 Route User',
      status: 'active',
      disabledAt: null,
      deletedAt: null,
    },
  });
  const category = await prisma.modelCategory.upsert({
    where: {
      slug: 'm6-route-images',
    },
    create: {
      name: 'M6 Route Images',
      slug: 'm6-route-images',
      sortOrder: -8000,
      isEnabled: true,
    },
    update: {
      deletedAt: null,
      isEnabled: true,
    },
  });
  const model = await prisma.aiModel.upsert({
    where: {
      id: ROUTE_MODEL_ID,
    },
    create: {
      id: ROUTE_MODEL_ID,
      categoryId: category.id,
      modelId: `m6-route-model-${Date.now()}`,
      displayName: 'M6 Route Model',
      providerName: 'Route',
      endpointType: 'openai_image_generations',
      referenceTransferMode: 'none',
      supportsReferenceImage: false,
      isEnabled: true,
      isRecommended: false,
      sortOrder: -8000,
      defaultParams: {},
      parameterSchema: [],
    },
    update: {
      categoryId: category.id,
      deletedAt: null,
      isEnabled: true,
    },
  });
  const encryptedPrompt = codec.encryptSecret('m6 route full prompt');
  const encryptedParams = codec.encryptSecret(JSON.stringify({ size: '1024x1024' }));
  const task = await prisma.imageTask.create({
    data: {
      userId: user.id,
      modelRecordId: model.id,
      modelIdSnapshot: model.modelId,
      endpointTypeSnapshot: 'openai_image_generations',
      newApiBaseUrlSnapshot: 'https://route.example.test/private',
      promptSummary: 'm6 route prompt summary',
      encryptedPrompt: encryptedPrompt.encrypted,
      promptIv: encryptedPrompt.iv,
      promptTag: encryptedPrompt.tag,
      parameterSnapshot: {
        size: '1024x1024',
      },
      sanitizedParameterSnapshot: {
        size: '1024x1024',
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
  const requestLog = await prisma.requestLog.create({
    data: {
      userId: user.id,
      taskId: task.id,
      attemptId: attempt.id,
      newApiBaseUrlHost: 'route.example.test',
      modelId: model.modelId,
      endpointType: 'openai_image_generations',
      status: 'succeeded',
      httpStatus: 200,
      durationMs: 88,
      promptSummary: 'm6 route prompt summary',
      encryptedPrompt: encryptedPrompt.encrypted,
      promptIv: encryptedPrompt.iv,
      promptTag: encryptedPrompt.tag,
      sanitizedParams: {
        size: '1024x1024',
      },
      encryptedParams: encryptedParams.encrypted,
      paramsIv: encryptedParams.iv,
      paramsTag: encryptedParams.tag,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: 'admin_route_verify_m6',
      targetType: 'request_log',
      targetId: requestLog.id,
      result: 'success',
      metadata: {
        marker: 'M6 route audit marker',
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return {
    user,
    model,
    requestLog,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
