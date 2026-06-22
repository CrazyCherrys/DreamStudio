import { PrismaClient } from '@prisma/client';

import { ImageTasksService } from '../apps/api/src/modules/image-tasks/image-tasks.service';
import { normalizeParameterSchema } from '../apps/api/src/modules/model-catalog/parameter-schema';
import { EncryptionService } from '../apps/api/src/modules/new-api-config/encryption.service';

const prisma = new PrismaClient();
const VERIFY_CLIENT_REQUEST_ID = `verify-schema-v2-${Date.now()}`;

const schemaV2 = [
  {
    key: 'n',
    label: '张数',
    type: 'integer',
    required: false,
    default: 1,
    min: 1,
    max: 4,
    ui: {
      group: 'quick',
      slot: 'count',
      order: 10,
    },
    capability: 'count',
    send_policy: 'when_present',
    validation: {
      min: 1,
      max: 4,
    },
    help_url: 'https://developers.openai.com/api/docs/guides/image-generation',
  },
  {
    key: 'aspect_ratio',
    label: '比例',
    type: 'select',
    required: false,
    default: '1:1',
    options: [
      { label: '1:1', value: '1:1' },
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' },
    ],
    ui: {
      group: 'quick',
      slot: 'aspect_ratio',
      order: 20,
    },
    capability: 'aspect_ratio',
    send_policy: 'when_present',
    validation: {
      enum: ['1:1', '16:9', '9:16'],
    },
  },
  {
    key: 'size',
    label: '分辨率',
    type: 'select',
    required: false,
    default: '1024x1024',
    options: [
      { label: '1024x1024', value: '1024x1024' },
      { label: '1536x1024', value: '1536x1024' },
      { label: '1024x1536', value: '1024x1536' },
    ],
    ui: {
      group: 'quick',
      slot: 'resolution',
      order: 30,
    },
    capability: 'resolution',
    send_policy: 'when_present',
    validation: {
      enum: ['1024x1024', '1536x1024', '1024x1536'],
    },
  },
  {
    key: 'internal_trace',
    label: '内部追踪',
    type: 'string',
    required: false,
    default: 'trace-should-not-send',
    ui: {
      group: 'hidden',
      slot: 'seed',
      order: 90,
    },
    capability: 'debug',
    send_policy: 'never',
    validation: {
      pattern: '^trace-',
    },
    deprecated: true,
  },
];

async function main() {
  const normalized = normalizeParameterSchema(schemaV2);
  assert(
    normalized.some((field) => field.ui?.group === 'quick' && field.ui.slot === 'count'),
    'ui.group=quick count field was not recognized',
  );
  assert(
    normalized.some((field) => field.ui?.group === 'quick' && field.ui.slot === 'aspect_ratio'),
    'ui.slot=aspect_ratio field was not recognized',
  );
  assert(
    normalized.some((field) => field.ui?.group === 'quick' && field.ui.slot === 'resolution'),
    'ui.slot=resolution field was not recognized',
  );
  assert(
    normalized.some(
      (field) =>
        field.key === 'internal_trace' && field.send_policy === 'never' && field.deprecated,
    ),
    'send_policy=never/deprecated metadata was not preserved',
  );
  expectSchemaFailure(
    [
      {
        key: 'bad_group',
        label: 'Bad',
        type: 'string',
        required: false,
        ui: {
          group: 'floating',
        },
      },
    ],
    'invalid ui.group should fail',
  );
  expectSchemaFailure(
    [
      {
        key: 'bad_send',
        label: 'Bad',
        type: 'string',
        required: false,
        send_policy: 'raw_payload',
      },
    ],
    'invalid send_policy should fail',
  );

  const service = new ImageTasksService(new EncryptionService());
  try {
    const admin = await prisma.user.findFirstOrThrow({
      where: {
        role: 'super_admin',
        status: 'active',
        deletedAt: null,
      },
    });
    await ensureValidNewApiConfig(admin.id);
    const model = await prisma.aiModel.findFirstOrThrow({
      where: {
        modality: 'image',
        isEnabled: true,
        deletedAt: null,
        executionProfiles: {
          some: {
            isDefault: true,
            isEnabled: true,
            deletedAt: null,
            revisions: {
              some: {
                status: 'active',
              },
            },
          },
        },
      },
      include: {
        executionProfiles: {
          where: {
            isDefault: true,
            isEnabled: true,
            deletedAt: null,
          },
          include: {
            revisions: {
              where: {
                status: 'active',
              },
              orderBy: {
                revisionNo: 'desc',
              },
              take: 1,
            },
          },
          take: 1,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const profile = model.executionProfiles[0]!;
    const revision = profile.revisions[0]!;
    const originalRevision = {
      parameterSchema: revision.parameterSchema,
      defaultParams: revision.defaultParams,
      requestMapping: revision.requestMapping,
    };

    try {
      await prisma.aiModelExecutionProfileRevision.update({
        where: {
          id: revision.id,
        },
        data: {
          parameterSchema: schemaV2,
          defaultParams: {
            n: 1,
            aspect_ratio: '1:1',
            size: '1024x1024',
            internal_trace: 'trace-should-not-send',
          },
          requestMapping: {
            content_type: 'json',
            fields: [
              { source: 'model', target: 'model' },
              { source: 'prompt', target: 'prompt' },
              { source: 'params.n', target: 'n', omit_if_null: true },
              { source: 'params.aspect_ratio', target: 'aspect_ratio', omit_if_null: true },
              { source: 'params.size', target: 'size', omit_if_null: true },
              { source: 'params.internal_trace', target: 'internal_trace', omit_if_null: true },
            ],
          },
        },
      });

      const session = {
        tokenHash: 'verify-token',
        sessionId: 'verify-session',
        userId: admin.id,
        csrfToken: 'verify-csrf',
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: admin.id,
          username: admin.username,
          display_name: admin.displayName,
          role: admin.role,
          status: admin.status,
        },
      };

      const created = await service.createTask(
        {
          model_record_id: model.id,
          execution_profile_id: profile.id,
          prompt: 'verify parameter schema v2',
          parameters: {
            n: 2,
            aspect_ratio: '16:9',
            size: '1536x1024',
          },
          reference_asset_ids: [],
          client_request_id: VERIFY_CLIENT_REQUEST_ID,
        },
        session,
      );
      const task = await prisma.imageTask.findUniqueOrThrow({
        where: {
          id: created.item.id,
        },
      });

      assert(
        isObject(task.parameterSnapshot) && !('internal_trace' in task.parameterSnapshot),
        'send_policy=never parameter leaked into parameter_snapshot',
      );
      assert(
        isObject(task.resolvedRequestSanitizedSnapshot) &&
          isObject(task.resolvedRequestSanitizedSnapshot.body) &&
          !('internal_trace' in task.resolvedRequestSanitizedSnapshot.body),
        'send_policy=never parameter leaked into resolved request snapshot',
      );

      await expectFailure(
        service.createTask(
          {
            model_record_id: model.id,
            execution_profile_id: profile.id,
            prompt: 'verify undeclared parameter rejection schema v2',
            parameters: {
              raw_payload: true,
            },
            reference_asset_ids: [],
            client_request_id: `verify-schema-v2-invalid-${Date.now()}`,
          },
          session,
        ),
        'undeclared parameter should be rejected',
      );
    } finally {
      await prisma.aiModelExecutionProfileRevision.update({
        where: {
          id: revision.id,
        },
        data: originalRevision,
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            'schema_v2_quick_group_recognized',
            'schema_v2_count_aspect_ratio_resolution_slots_present',
            'schema_v2_deprecated_preserved',
            'invalid_ui_group_rejected',
            'invalid_send_policy_rejected',
            'undeclared_parameter_rejected',
            'send_policy_never_omitted_from_final_request',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await service.onModuleDestroy();
    await prisma.$disconnect();
  }
}

async function ensureValidNewApiConfig(userId: string) {
  const codec = new EncryptionService();
  const encrypted = codec.encryptSecret('sk-verify-schema-v2');
  await prisma.userNewApiConfig.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      newApiBaseUrl: 'http://127.0.0.1:3999',
      usesCustomBaseUrl: true,
      encryptedApiKey: encrypted.encrypted,
      keyIv: encrypted.iv,
      keyTag: encrypted.tag,
      keyVersion: encrypted.keyVersion,
      maskedApiKey: 'sk-***schema-v2',
      status: 'valid',
      lastTestedAt: new Date(),
      lastTestError: null,
    },
    update: {
      newApiBaseUrl: 'http://127.0.0.1:3999',
      usesCustomBaseUrl: true,
      encryptedApiKey: encrypted.encrypted,
      keyIv: encrypted.iv,
      keyTag: encrypted.tag,
      keyVersion: encrypted.keyVersion,
      maskedApiKey: 'sk-***schema-v2',
      status: 'valid',
      lastTestedAt: new Date(),
      lastTestError: null,
    },
  });
}

function expectSchemaFailure(schema: unknown, message: string) {
  try {
    normalizeParameterSchema(schema);
  } catch {
    return;
  }
  throw new Error(`Verification failed: ${message}`);
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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
