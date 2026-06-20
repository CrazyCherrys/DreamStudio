import { createRequire } from 'node:module';

const require = createRequire(__filename);
const playwrightPath =
  process.env.PLAYWRIGHT_PACKAGE_PATH ?? '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright';
const { chromium } = require(playwrightPath) as {
  chromium: {
    launch(options: { executablePath?: string; headless: boolean }): Promise<{
      newPage(): Promise<{
        goto(url: string, options?: { waitUntil: 'networkidle' }): Promise<unknown>;
        getByLabel(label: string): { fill(value: string): Promise<void> };
        getByRole(
          role: string,
          options: { name: string },
        ): {
          click(): Promise<void>;
          waitFor(options?: { timeout: number }): Promise<void>;
        };
        getByText(text: string): { waitFor(options?: { timeout: number }): Promise<void> };
        waitForURL(pattern: string, options?: { timeout: number }): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
};

const WEB_BASE_URL = process.env.DREAMSTUDIO_VERIFY_WEB_URL ?? 'http://127.0.0.1:3000';
const ADMIN_USERNAME = process.env.INITIAL_ADMIN_USERNAME ?? 'Cherry';
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? 'DreamStudio';

async function main() {
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

    await page.goto(`${WEB_BASE_URL}/admin/storage-settings`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '存储设置', exact: true }).waitFor({ timeout: 10000 });
    await page.getByText('切换存储不会自动迁移旧文件').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: '测试存储' }).waitFor({ timeout: 10000 });

    await page.goto(`${WEB_BASE_URL}/studio/assets`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '资产库', exact: true }).waitFor({ timeout: 10000 });
    await page
      .getByRole('heading', { name: '上传参考图', exact: true })
      .waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: '结果图' }).waitFor({ timeout: 10000 });

    console.log(
      JSON.stringify({
        ok: true,
        checks: ['admin_storage_settings_route', 'studio_assets_route', 'reference_uploader'],
      }),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
