import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

import { SuperAdminGuard } from '../apps/api/src/modules/auth/super-admin.guard';
import { ModelCatalogService } from '../apps/api/src/modules/model-catalog/model-catalog.service';
import { AuditLogService } from '../apps/api/src/modules/new-api-config/audit-log.service';
import { EncryptionService } from '../apps/api/src/modules/new-api-config/encryption.service';
import { NewApiConnectionService } from '../apps/api/src/modules/new-api-config/new-api-connection.service';
import { NewApiConfigService } from '../apps/api/src/modules/new-api-config/new-api-config.service';
import { SystemSettingsService } from '../apps/api/src/modules/new-api-config/system-settings.service';

const prisma = new PrismaClient();

async function main() {
  const systemSettingsService = new SystemSettingsService();
  const auditLogService = new AuditLogService(systemSettingsService);
  const encryptionService = new EncryptionService();
  const service = new ModelCatalogService(
    auditLogService,
    new NewApiConfigService(
      auditLogService,
      new NewApiConnectionService(),
      encryptionService,
      systemSettingsService,
    ),
  );
  const admin = await prisma.user.findFirstOrThrow({
    where: {
      role: UserRole.super_admin,
      status: UserStatus.active,
      deletedAt: null,
    },
  });
  const request = {
    ip: '127.0.0.1',
    headers: {},
    get: () => undefined,
    header: () => undefined,
  } as never;
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

  assertSuperAdminGuardRejectsUser();

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
            take: 1,
          },
        },
        take: 1,
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const profile = model.executionProfiles[0]!;
  const originalActive = profile.revisions[0]!;

  const listedProfiles = await service.listExecutionProfiles(model.id);
  assert(
    listedProfiles.items.some((item) => item.id === profile.id),
    'admin profile list did not include default profile',
  );

  const createdDraft = await service.createExecutionProfileRevision(
    profile.id,
    {
      change_summary: 'verify admin execution profile draft',
      parameter_schema: [
        ...(profile.parameterSchema as unknown[]),
        {
          key: 'verify_ratio',
          label: 'Verify Ratio',
          type: 'select',
          required: false,
          default: '1:1',
          options: [
            { label: '1:1', value: '1:1' },
            { label: '16:9', value: '16:9' },
          ],
          ui: {
            group: 'quick',
            slot: 'aspect_ratio',
            order: 999,
          },
          send_policy: 'never',
        },
      ],
      default_params: {
        ...(profile.defaultParams as Record<string, unknown>),
        verify_ratio: '1:1',
      },
    },
    session,
    request,
  );
  assert(createdDraft.item.status === 'draft', 'created revision should be draft');

  const activeBeforeActivate = await prisma.aiModelExecutionProfileRevision.findFirstOrThrow({
    where: {
      executionProfileId: profile.id,
      status: 'active',
    },
  });
  assert(
    activeBeforeActivate.id === originalActive.id,
    'draft revision should not replace active revision before activation',
  );

  const lint = await service.lintExecutionProfileRevision(createdDraft.item.id);
  assert(lint.result.ok, 'draft revision lint should pass');

  const preview = await service.previewExecutionProfileRevision(createdDraft.item.id, {
    prompt: 'verify profile preview',
    parameters: {
      n: 1,
    },
  });
  assert(preview.preview.body.model === originalActive.upstreamModelId, 'preview model mismatch');

  const test = await service.testExecutionProfileRevision(createdDraft.item.id);
  assert(test.result.ok && test.result.dry_run === true, 'revision dry-run test should pass');

  const importedJsonDraft = await service.createExecutionProfileRevision(
    profile.id,
    {
      source_kind: 'imported_json',
      source_summary: 'verify imported revision JSON',
      adapter_key: originalActive.adapterKey,
      adapter_version: originalActive.adapterVersion,
      transport_key: originalActive.transportKey,
      upstream_model_id: originalActive.upstreamModelId,
      upstream_endpoint_path: originalActive.upstreamEndpointPath,
      reference_transfer_mode: originalActive.referenceTransferMode,
      supports_reference_image: originalActive.supportsReferenceImage,
      max_reference_images: originalActive.maxReferenceImages,
      parameter_schema: originalActive.parameterSchema,
      default_params: originalActive.defaultParams,
      request_mapping: originalActive.requestMapping,
      response_parser_key: originalActive.responseParserKey,
      capabilities: originalActive.capabilities,
      validation_rules: originalActive.validationRules,
      change_summary: 'verify imported revision JSON draft',
    },
    session,
    request,
  );
  assert(importedJsonDraft.item.status === 'draft', 'imported JSON revision should be draft');
  assert(
    importedJsonDraft.item.source_kind === 'imported_json',
    'imported JSON revision source kind mismatch',
  );
  const activeAfterJsonImport = await prisma.aiModelExecutionProfileRevision.findFirstOrThrow({
    where: {
      executionProfileId: profile.id,
      status: 'active',
    },
  });
  assert(
    activeAfterJsonImport.id === originalActive.id,
    'imported JSON draft should not replace active revision before activation',
  );

  const activated = await service.activateExecutionProfileRevision(
    createdDraft.item.id,
    session,
    request,
  );
  assert(activated.item.status === 'active', 'activated revision should be active');

  const archivedOriginal = await prisma.aiModelExecutionProfileRevision.findUniqueOrThrow({
    where: {
      id: originalActive.id,
    },
  });
  assert(archivedOriginal.status === 'archived', 'previous active revision should be archived');

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'admin_profile_list_available',
          'ordinary_user_rejected_by_admin_guard',
          'super_admin_can_create_draft_revision',
          'draft_revision_does_not_affect_active_before_activation',
          'revision_lint_passes',
          'revision_preview_request_builds',
          'revision_test_dry_run_passes',
          'revision_json_import_creates_draft',
          'activation_archives_previous_active_revision',
        ],
        profile_id: profile.id,
        draft_revision_id: createdDraft.item.id,
        imported_json_revision_id: importedJsonDraft.item.id,
      },
      null,
      2,
    ),
  );
}

function assertSuperAdminGuardRejectsUser() {
  const guard = new SuperAdminGuard();
  try {
    guard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({
          auth: {
            user: {
              role: 'user',
            },
          },
        }),
      }),
    } as never);
  } catch {
    return;
  }
  throw new Error('Verification failed: ordinary user should be rejected by admin guard');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
