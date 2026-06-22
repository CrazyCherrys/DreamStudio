import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

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

  const templates = await service.listProfileTemplates();
  const templateIds = new Set(templates.items.map((template) => template.id));
  for (const requiredTemplate of [
    'openai-image-generation-gpt-image-2',
    'openai-image-edit-gpt-image-2',
    'openai-responses-image-tool',
    'openai-compatible-image-generation-minimal',
  ]) {
    assert(templateIds.has(requiredTemplate), `missing template ${requiredTemplate}`);
  }

  const openAiTemplates = templates.items.filter(
    (template) => template.category === 'openai_official',
  );
  assert(openAiTemplates.length >= 3, 'official OpenAI templates should be listed');
  for (const template of openAiTemplates) {
    assert(template.source_kind === 'openai_official', `${template.id} source_kind mismatch`);
    assert(Boolean(template.source_url), `${template.id} source_url missing`);
    assert(Boolean(template.source_checked_at), `${template.id} source_checked_at missing`);
  }

  const compatibleMinimal = templates.items.find(
    (template) => template.id === 'openai-compatible-image-generation-minimal',
  );
  assert(
    compatibleMinimal?.category === 'openai_compatible',
    'compatible template category mismatch',
  );
  assert(
    compatibleMinimal.source_kind === 'third_party_docs',
    'compatible template source_kind mismatch',
  );

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
  const publicBefore = await service.getPublicModel(model.id, session);
  assert(
    publicBefore.item.default_execution_profile?.revision_id === originalActive.id,
    'public model should start with the original active revision',
  );

  const imported = await service.importProfileTemplateRevision(
    profile.id,
    'openai-image-generation-gpt-image-2',
    {
      upstream_model_id: model.modelId,
    },
    session,
    request,
  );
  assert(imported.item.status === 'draft', 'template import should create a draft');
  assert(imported.item.source_kind === 'openai_official', 'template draft source_kind mismatch');
  assert(
    imported.item.adapter_key === 'openai_images_generation',
    'template draft adapter mismatch',
  );

  const publicAfterDraft = await service.getPublicModel(model.id, session);
  assert(
    publicAfterDraft.item.default_execution_profile?.revision_id === originalActive.id,
    'draft import should not change the public default profile',
  );

  const lint = await service.lintExecutionProfileRevision(imported.item.id);
  assert(lint.result.ok, 'imported template draft lint should pass');

  const preview = await service.previewExecutionProfileRevision(imported.item.id, {
    prompt: 'verify profile template preview',
    parameters: {
      n: 1,
      size: '1024x1024',
      quality: 'auto',
      output_format: 'png',
      output_compression: 100,
      background: 'auto',
      moderation: 'auto',
    },
  });
  assert(preview.preview.endpoint_path === '/v1/images/generations', 'preview endpoint mismatch');
  assert(preview.preview.body.model === model.modelId, 'preview model mismatch');
  assert(
    preview.preview.body.prompt === 'verify profile template preview',
    'preview prompt mismatch',
  );
  assert(preview.preview.body.output_format === 'png', 'preview output_format missing');

  const diff = await service.diffExecutionProfileRevision(imported.item.id);
  assert(
    diff.diff.against_revision_id === originalActive.id,
    'diff baseline should be active revision',
  );
  assert(
    diff.diff.changes.some((change) => change.field === 'parameter_schema' && change.changed),
    'template import diff should include parameter_schema changes',
  );

  const compatibleCopy = await service.importProfileTemplateRevision(
    profile.id,
    'openai-image-generation-gpt-image-2',
    {
      mode: 'openai_compatible_copy',
      upstream_model_id: 'compatible-image-test',
    },
    session,
    request,
  );
  assert(compatibleCopy.item.status === 'draft', 'compatible copy should create a draft');
  assert(
    compatibleCopy.item.source_kind === 'third_party_docs',
    'compatible copy source_kind mismatch',
  );
  const compatibleCapabilities = readObject(compatibleCopy.item.capabilities);
  const compatibleValidationRules = readObject(compatibleCopy.item.validation_rules);
  assert(
    compatibleCapabilities.requires_provider_field_review === true,
    'compatible copy should require provider field review',
  );
  assert(
    Array.isArray(compatibleValidationRules.warnings) &&
      compatibleValidationRules.warnings.some((warning) =>
        String(warning).includes('OpenAI-compatible'),
      ),
    'compatible copy warning missing',
  );

  const minimalDraft = await service.importProfileTemplateRevision(
    profile.id,
    'openai-compatible-image-generation-minimal',
    {
      upstream_model_id: 'compatible-minimal-image-test',
    },
    session,
    request,
  );
  const minimalFieldKeys = new Set(
    Array.isArray(minimalDraft.item.parameter_schema)
      ? minimalDraft.item.parameter_schema
          .map((field) => (readObject(field).key ? String(readObject(field).key) : null))
          .filter((key): key is string => Boolean(key))
      : [],
  );
  for (const unsupportedFullOpenAiField of [
    'quality',
    'output_format',
    'output_compression',
    'background',
    'moderation',
  ]) {
    assert(
      !minimalFieldKeys.has(unsupportedFullOpenAiField),
      `minimal compatible template should not include ${unsupportedFullOpenAiField}`,
    );
  }

  const activated = await service.activateExecutionProfileRevision(
    imported.item.id,
    session,
    request,
  );
  assert(activated.item.status === 'active', 'activated imported revision should be active');
  const publicAfterActivation = await service.getPublicModel(model.id, session);
  assert(
    publicAfterActivation.item.default_execution_profile?.revision_id === imported.item.id,
    'public model profile should change only after activation',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'profile_templates_listed',
          'official_templates_include_source_metadata',
          'compatible_template_is_minimal',
          'template_import_creates_draft',
          'draft_import_does_not_change_public_profile',
          'imported_template_lints_and_previews',
          'revision_diff_reports_active_changes',
          'openai_compatible_copy_requires_provider_review',
          'activation_updates_public_profile',
        ],
        profile_id: profile.id,
        active_before_revision_id: originalActive.id,
        imported_revision_id: imported.item.id,
        compatible_copy_revision_id: compatibleCopy.item.id,
        minimal_compatible_revision_id: minimalDraft.item.id,
      },
      null,
      2,
    ),
  );
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
