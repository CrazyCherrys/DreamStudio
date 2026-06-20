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
const ROUTE_MODEL_ID =
  process.env.DREAMSTUDIO_VERIFY_ROUTE_MODEL_ID ?? '00000000-0000-4000-8000-00000000a501';
const TASK_PROMPT = `m5 route seeded task ${Date.now()}`;

const prisma = new PrismaClient();

async function main() {
  const codec = new DreamStudioSecretCodec();
  const admin = await prisma.user.findFirstOrThrow({
    where: {
      username: ADMIN_USERNAME,
      role: 'super_admin',
      status: 'active',
    },
  });
  const category = await prisma.modelCategory.upsert({
    where: {
      slug: 'm5-route-images',
    },
    create: {
      name: 'M5 Route Images',
      slug: 'm5-route-images',
      icon: 'image',
      sortOrder: -10000,
      isEnabled: true,
    },
    update: {
      name: 'M5 Route Images',
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
      modelId: `m5-route-model-${Date.now()}`,
      displayName: 'M5 Route Render Model',
      providerName: 'Route',
      endpointType: 'openai_image_generations',
      referenceTransferMode: 'none',
      supportsReferenceImage: false,
      isEnabled: true,
      isRecommended: true,
      sortOrder: -10000,
      defaultParams: {
        size: '1024x1024',
      },
      parameterSchema: [
        {
          key: 'size',
          label: 'M5 Route Size',
          type: 'select',
          required: true,
          default: '1024x1024',
          options: [{ label: '1024 x 1024', value: '1024x1024' }],
        },
      ],
    },
    update: {
      categoryId: category.id,
      displayName: 'M5 Route Render Model',
      deletedAt: null,
      isEnabled: true,
      sortOrder: -10000,
      parameterSchema: [
        {
          key: 'size',
          label: 'M5 Route Size',
          type: 'select',
          required: true,
          default: '1024x1024',
          options: [{ label: '1024 x 1024', value: '1024x1024' }],
        },
      ],
    },
  });

  const encryptedPrompt = codec.encryptSecret('m5 route seeded task prompt');
  const task = await prisma.imageTask.create({
    data: {
      userId: admin.id,
      modelRecordId: model.id,
      modelIdSnapshot: model.modelId,
      endpointTypeSnapshot: 'openai_image_generations',
      newApiBaseUrlSnapshot: 'http://route.local',
      promptSummary: TASK_PROMPT,
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

    await page.goto(`${WEB_BASE_URL}/studio`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Prompt 与参数' }).waitFor({ timeout: 10000 });
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).waitFor({ timeout: 10000 });
    await page.getByLabel('M5 Route Size').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: '生成图片' }).waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/studio/tasks`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '任务列表' }).waitFor({ timeout: 10000 });
    await page.getByText(TASK_PROMPT, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole('link', { name: '详情' }).first().waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/studio/tasks/${task.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '任务详情' }).waitFor({ timeout: 10000 });
    await page.getByRole('heading', { name: '参数快照' }).waitFor({ timeout: 10000 });
    await page.getByRole('heading', { name: '结果图' }).waitFor({ timeout: 10000 });
    await page.getByRole('heading', { name: '尝试记录' }).waitFor({ timeout: 10000 });

    console.log(
      JSON.stringify({
        ok: true,
        checks: ['studio_submit_ui', 'studio_tasks_route', 'studio_task_detail_route'],
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
