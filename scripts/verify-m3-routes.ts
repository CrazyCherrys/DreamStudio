import { createRequire } from 'node:module';

import { PrismaClient } from '@prisma/client';

const require = createRequire(__filename);
const playwrightPath =
  process.env.PLAYWRIGHT_PACKAGE_PATH ?? '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = require(playwrightPath) as typeof import('playwright');

const WEB_BASE_URL = process.env.DREAMSTUDIO_VERIFY_WEB_URL ?? 'http://127.0.0.1:3000';
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';
const ROUTE_MODEL_ID =
  process.env.DREAMSTUDIO_VERIFY_ROUTE_MODEL_ID ?? '00000000-0000-4000-8000-00000000a301';

const prisma = new PrismaClient();

async function main() {
  const category = await prisma.modelCategory.upsert({
    where: {
      slug: 'm3-route-general',
    },
    create: {
      name: 'M3 Route General',
      slug: 'm3-route-general',
      icon: 'palette',
      sortOrder: -9000,
      isEnabled: true,
    },
    update: {
      name: 'M3 Route General',
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
      modelId: `m3-route-model-${Date.now()}`,
      displayName: 'M3 Route Render Model',
      providerName: 'Route',
      endpointType: 'openai_image_generations',
      referenceTransferMode: 'none',
      supportsReferenceImage: false,
      isEnabled: true,
      isRecommended: true,
      sortOrder: -9000,
      defaultParams: {
        size: '1024x1024',
      },
      parameterSchema: [
        {
          key: 'size',
          label: 'Route Size',
          type: 'select',
          required: true,
          default: '1024x1024',
          options: [{ label: '1024 x 1024', value: '1024x1024' }],
        },
      ],
    },
    update: {
      categoryId: category.id,
      displayName: 'M3 Route Render Model',
      deletedAt: null,
      isEnabled: true,
      parameterSchema: [
        {
          key: 'size',
          label: 'Route Size',
          type: 'select',
          required: true,
          default: '1024x1024',
          options: [{ label: '1024 x 1024', value: '1024x1024' }],
        },
      ],
    },
  });

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

    await page.goto(`${WEB_BASE_URL}/admin/model-categories`, { waitUntil: 'networkidle' });
    await page.getByText('模型分类').first().waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/admin/models`, { waitUntil: 'networkidle' });
    await page.getByText('模型目录').waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/admin/model-sync`, { waitUntil: 'networkidle' });
    await page.getByText('模型候选拉取').waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/studio`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: model.displayName }).waitFor({ timeout: 10000 });
    await page.getByLabel('Route Size').waitFor({ timeout: 10000 });

    console.log(
      JSON.stringify({
        ok: true,
        checks: [
          'admin_category_route',
          'admin_models_route',
          'admin_model_sync_route',
          'studio_parameter_schema_render',
        ],
      }),
    );
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
