import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { PrismaClient } from '@prisma/client';

import { getOptionalEnv } from '@dreamstudio/config';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

const localStorageRoot = getOptionalEnv('LOCAL_STORAGE_ROOT', '/data');
const inputPath = join(localStorageRoot, 'image', 'input');
const outputPath = join(localStorageRoot, 'image', 'output');
const INITIAL_ADMIN_DEFAULT_USERNAME = 'Cherry';
const INITIAL_ADMIN_DEFAULT_PASSWORD = 'DreamStudio';
const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_KEY_LENGTH = 64;

const defaultSettings = [
  {
    key: 'default_new_api_base_url',
    value: '',
    description: 'Default new-api base URL. Configure in admin before M2 usage.',
  },
  {
    key: 'allow_user_custom_new_api_base_url',
    value: true,
    description: 'Whether users may override the default new-api base URL.',
  },
  {
    key: 'registration_enabled',
    value: true,
    description: 'Whether username/password registration is open.',
  },
  {
    key: 'image_task_timeout_seconds',
    value: 600,
    description: 'Default image task timeout in seconds.',
  },
  {
    key: 'image_task_max_attempts',
    value: 3,
    description: 'Default maximum attempts for image generation tasks.',
  },
  {
    key: 'image_task_retry_backoff_seconds',
    value: 5,
    description: 'Default retry backoff in seconds.',
  },
  {
    key: 'per_user_running_task_limit',
    value: 2,
    description: 'Default per-user running image task limit.',
  },
  {
    key: 'global_running_task_limit',
    value: 10,
    description: 'Default global running image task limit.',
  },
  {
    key: 'request_log_retention_hours',
    value: 4320,
    description: 'Default request log retention, 180 days.',
  },
  {
    key: 'audit_log_retention_hours',
    value: 8760,
    description: 'Default audit log retention, 365 days.',
  },
] as const;

async function main() {
  await mkdir(inputPath, { recursive: true });
  await mkdir(outputPath, { recursive: true });

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: {
        description: setting.description,
      },
    });
  }

  const activeStorage = await prisma.storageSetting.findFirst({
    where: { isActive: true },
  });

  if (!activeStorage) {
    await prisma.storageSetting.create({
      data: {
        driver: 'local',
        isActive: true,
        localInputPath: inputPath,
        localOutputPath: outputPath,
        referenceRetentionHours: 12,
        resultRetentionHours: 12,
      },
    });
  }

  const initialAdmin = await ensureInitialAdmin();

  console.log(
    JSON.stringify({
      level: 'info',
      module: 'init',
      event: 'm0_initialized',
      settings: defaultSettings.length,
      local_storage_root: localStorageRoot,
      initial_admin: initialAdmin,
    }),
  );
}

function getInitialAdminConfig() {
  const username = getOptionalEnv('INITIAL_ADMIN_USERNAME', INITIAL_ADMIN_DEFAULT_USERNAME).trim();
  const password = getOptionalEnv('INITIAL_ADMIN_PASSWORD', INITIAL_ADMIN_DEFAULT_PASSWORD);

  if (!/^[a-zA-Z0-9_.-]{3,120}$/.test(username)) {
    throw new Error(
      'Invalid INITIAL_ADMIN_USERNAME: use 3-120 letters, numbers, underscores, dots, or hyphens',
    );
  }

  if (password.length < 8 || password.length > 256) {
    throw new Error('Invalid INITIAL_ADMIN_PASSWORD: use 8-256 characters');
  }

  return {
    username,
    password,
  };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `${PASSWORD_HASH_PREFIX}$${salt}$${derivedKey.toString('base64url')}`;
}

async function ensureInitialAdmin() {
  const existingAdminCount = await prisma.user.count({
    where: {
      role: 'super_admin',
    },
  });

  if (existingAdminCount > 0) {
    return {
      action: 'skipped_existing_super_admin',
    };
  }

  const config = getInitialAdminConfig();
  const passwordHash = await hashPassword(config.password);
  const existingUser = await prisma.user.findUnique({
    where: {
      username: config.username,
    },
  });

  if (existingUser) {
    await prisma.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        passwordHash,
        role: 'super_admin',
        status: 'active',
        disabledAt: null,
        deletedAt: null,
      },
    });
    await prisma.userSession.updateMany({
      where: {
        userId: existingUser.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      action: 'upgraded_existing_user',
      username: config.username,
    };
  }

  await prisma.user.create({
    data: {
      username: config.username,
      passwordHash,
      displayName: config.username,
      role: 'super_admin',
      status: 'active',
    },
  });

  return {
    action: 'created',
    username: config.username,
  };
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        module: 'init',
        event: 'm0_init_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
