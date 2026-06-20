import { createRequire } from 'node:module';

import { PrismaClient } from '@prisma/client';

const require = createRequire(__filename);
const playwrightPath =
  process.env.PLAYWRIGHT_PACKAGE_PATH ?? '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = require(playwrightPath) as typeof import('playwright');

const WEB_BASE_URL = process.env.DREAMSTUDIO_VERIFY_WEB_URL ?? 'http://127.0.0.1:3000';
const API_BASE_URL = process.env.DREAMSTUDIO_VERIFY_API_URL ?? 'http://127.0.0.1:3001';
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';
const USERNAME = `m2_route_user_${Date.now()}`;
const PASSWORD = 'DreamStudioM2!';

const prisma = new PrismaClient();

interface AuthPayload {
  data?: {
    new_api_config_status?: string;
  };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
      '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
  });

  try {
    const page = await browser.newPage();
    await page.goto(`${WEB_BASE_URL}/auth/register`, { waitUntil: 'networkidle' });
    await page.getByLabel('用户名').fill(USERNAME);
    await page.getByLabel('展示名').fill(USERNAME);
    await page.getByLabel('密码').fill(PASSWORD);
    await page.getByRole('button', { name: '注册并进入' }).click();
    await page.waitForURL('**/onboarding/new-api', { timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/studio`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/onboarding/new-api', { timeout: 10000 });

    const routeUser = await prisma.user.findUniqueOrThrow({
      where: {
        username: USERNAME,
      },
    });
    await prisma.userNewApiConfig.upsert({
      where: {
        userId: routeUser.id,
      },
      create: {
        userId: routeUser.id,
        newApiBaseUrl: 'http://127.0.0.1:3988',
        usesCustomBaseUrl: false,
        encryptedApiKey: 'route-test-encrypted-placeholder',
        keyIv: 'route-test-iv',
        keyTag: 'route-test-tag',
        keyVersion: 1,
        maskedApiKey: 'sk-***test',
        status: 'invalid',
        lastTestedAt: new Date(),
        lastTestError: 'route guard test invalid config',
      },
      update: {
        status: 'invalid',
        lastTestedAt: new Date(),
        lastTestError: 'route guard test invalid config',
      },
    });
    await page.goto(`${WEB_BASE_URL}/studio`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/onboarding/new-api', { timeout: 10000 });

    const adminPage = await browser.newPage();
    await adminPage.goto(`${WEB_BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
    await adminPage.getByLabel('用户名').fill(ADMIN_USERNAME);
    await adminPage.getByLabel('密码').fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: '登录' }).click();
    await adminPage.waitForURL('**/admin', { timeout: 10000 });
    await adminPage.getByText('系统设置').waitFor({ timeout: 10000 });

    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        username: USERNAME,
        password: PASSWORD,
      }),
    });
    const payload = (await response.json()) as AuthPayload;
    assert(
      payload.data?.new_api_config_status === 'missing' ||
        payload.data?.new_api_config_status === 'invalid',
      'auth/me-compatible payload includes missing or invalid new_api_config_status',
    );

    console.log(
      JSON.stringify({
        ok: true,
        checks: ['user_redirect_onboarding', 'invalid_redirect_onboarding', 'super_admin_admin'],
      }),
    );
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Route verification failed: ${message}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
