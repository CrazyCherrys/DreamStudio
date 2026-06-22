import { PrismaClient } from '@prisma/client';

import { ImageTasksService } from '../apps/api/src/modules/image-tasks/image-tasks.service';
import { EncryptionService } from '../apps/api/src/modules/new-api-config/encryption.service';

const prisma = new PrismaClient();
const VERIFY_CLIENT_REQUEST_ID = `verify-profile-snapshot-${Date.now()}`;

async function main() {
  const service = new ImageTasksService(new EncryptionService());
  try {
    const admin = await prisma.user.findFirstOrThrow({
      where: {
        role: 'super_admin',
        status: 'active',
        deletedAt: null,
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

    const created = await service.createTask(
      {
        model_record_id: model.id,
        execution_profile_id: profile.id,
        prompt: 'verify image task profile snapshot',
        parameters: {
          n: 1,
          size: '1024x1024',
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

    assert(task.executionProfileId === profile.id, 'execution_profile_id was not persisted');
    assert(
      task.executionProfileRevisionId === revision.id,
      'execution_profile_revision_id was not persisted',
    );
    assert(task.adapterKeySnapshot === revision.adapterKey, 'adapter_key_snapshot mismatch');
    assert(
      task.adapterVersionSnapshot === revision.adapterVersion,
      'adapter_version_snapshot mismatch',
    );
    assert(
      task.modelIdSnapshot === revision.upstreamModelId,
      'model_id_snapshot should use revision upstream_model_id',
    );
    assert(isObject(task.executionProfileSnapshot), 'execution_profile_snapshot missing');
    assert(isObject(task.requestMappingSnapshot), 'request_mapping_snapshot missing');
    assert(
      isObject(task.resolvedRequestSanitizedSnapshot),
      'resolved_request_sanitized_snapshot missing',
    );
    assert(
      task.resolvedRequestSanitizedSnapshot.adapter_key === revision.adapterKey,
      'resolved request snapshot does not include adapter key',
    );
    assert(
      task.resolvedRequestSanitizedSnapshot.body?.model === revision.upstreamModelId,
      'resolved request snapshot does not use revision upstream model',
    );

    const originalSnapshot = JSON.stringify(task.executionProfileSnapshot);
    await prisma.aiModelExecutionProfileRevision.update({
      where: {
        id: revision.id,
      },
      data: {
        changeSummary: `verify snapshot immutability ${Date.now()}`,
      },
    });
    const unchangedTask = await prisma.imageTask.findUniqueOrThrow({
      where: {
        id: task.id,
      },
    });
    assert(
      JSON.stringify(unchangedTask.executionProfileSnapshot) === originalSnapshot,
      'existing task execution profile snapshot changed after profile revision update',
    );

    await expectFailure(
      service.createTask(
        {
          model_record_id: model.id,
          execution_profile_id: profile.id,
          prompt: 'verify undeclared parameter rejection',
          parameters: {
            not_declared_by_profile: true,
          },
          reference_asset_ids: [],
          client_request_id: `verify-profile-snapshot-invalid-${Date.now()}`,
        },
        session,
      ),
      'undeclared profile parameter should be rejected',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            'image_task_execution_profile_id_persisted',
            'image_task_execution_profile_revision_id_persisted',
            'image_task_adapter_snapshot_persisted',
            'image_task_execution_profile_snapshot_persisted',
            'image_task_request_mapping_snapshot_persisted',
            'image_task_resolved_request_sanitized_snapshot_persisted',
            'image_task_snapshot_is_immutable_after_revision_update',
            'profile_schema_rejects_undeclared_parameters',
          ],
          task_id: task.id,
          model_id: model.modelId,
          execution_profile_id: profile.id,
          execution_profile_revision_id: revision.id,
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
  const encrypted = codec.encryptSecret('sk-verify-profile-snapshot');
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
      maskedApiKey: 'sk-***snapshot',
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
      maskedApiKey: 'sk-***snapshot',
      status: 'valid',
      lastTestedAt: new Date(),
      lastTestError: null,
    },
  });
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
