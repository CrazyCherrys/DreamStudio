import { readFileSync } from 'node:fs';

import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

import { ModelCatalogService } from '../apps/api/src/modules/model-catalog/model-catalog.service';
import { AuditLogService } from '../apps/api/src/modules/new-api-config/audit-log.service';
import { SystemSettingsService } from '../apps/api/src/modules/new-api-config/system-settings.service';

if (!process.env.DATABASE_URL) {
  const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const databaseUrlLine = envExample
    .split('\n')
    .find((line) => line.trim().startsWith('DATABASE_URL='));
  if (databaseUrlLine) {
    process.env.DATABASE_URL = databaseUrlLine.split('=', 2)[1]?.replace(/^"|"$/g, '') ?? '';
  }
}

const prisma = new PrismaClient();

async function main() {
  const systemSettingsService = new SystemSettingsService();
  const auditLogService = new AuditLogService(systemSettingsService);
  const service = new ModelCatalogService(auditLogService);
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
    'gemini-generate-content-image',
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
  const geminiTemplate = templates.items.find(
    (template) => template.id === 'gemini-generate-content-image',
  );
  assert(geminiTemplate?.category === 'gemini_official', 'Gemini template category mismatch');
  assert(geminiTemplate.source_kind === 'gemini_official', 'Gemini template source_kind mismatch');
  assert(
    geminiTemplate.adapter_key === 'gemini_generate_content',
    'Gemini template adapter mismatch',
  );
  assert(geminiTemplate.runtime_supported === true, 'Gemini generateContent should be runnable');
  const responsesTemplate = templates.items.find(
    (template) => template.id === 'openai-responses-image-tool',
  );
  assert(responsesTemplate?.runtime_supported === true, 'Responses template should be runnable');
  assert(responsesTemplate.publishable === true, 'Responses template should be publishable');
  assert(
    templates.items.some((template) => template.bootstrap.enabled),
    'at least one template should be bootstrap-enabled',
  );

  const presetClone = await service.cloneProfilePresetFromTemplate(
    'openai-image-generation-gpt-image-2',
    {
      label: 'Verify preset clone',
      mode: 'template',
    },
    session,
    request,
  );
  assert(
    presetClone.item.origin === 'template_clone',
    'cloned preset should record template_clone origin',
  );
  assert(
    presetClone.item.source_template_id === 'openai-image-generation-gpt-image-2',
    'cloned preset should keep source template id',
  );
  const presetList = await service.listProfilePresets();
  assert(
    presetList.items.some((preset) => preset.id === presetClone.item.id),
    'cloned preset should appear in preset list',
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
  const compatibleDefaultParams = readObject(compatibleCopy.item.default_params);
  assert(
    Object.keys(compatibleDefaultParams).length === 0,
    'compatible copy should not retain unconfirmed OpenAI defaults',
  );
  const compatibleFields = Array.isArray(compatibleCopy.item.parameter_schema)
    ? compatibleCopy.item.parameter_schema.map(readObject)
    : [];
  assert(compatibleFields.length > 0, 'compatible copy should keep fields for review');
  assert(
    compatibleFields.every((field) => {
      const validation = readObject(field.validation);
      return (
        validation.custom_validator === 'compatible_field_confirmed' &&
        validation.review_status === 'suspect'
      );
    }),
    'compatible copy fields should be marked suspect',
  );
  const compatibleLint = await service.lintExecutionProfileRevision(compatibleCopy.item.id);
  assert(!compatibleLint.result.ok, 'compatible copy with suspect fields should not lint');
  assert(
    compatibleLint.result.errors.some((error) =>
      error.message.includes('OpenAI-compatible 字段必须删除或确认支持后才能发布'),
    ),
    'compatible copy lint should explain provider field review',
  );
  assert(
    Array.isArray(compatibleValidationRules.warnings) &&
      compatibleValidationRules.warnings.some((warning) =>
        String(warning).includes('OpenAI-compatible'),
      ),
    'compatible copy warning missing',
  );

  const presetImported = await service.importProfilePresetRevision(
    profile.id,
    presetClone.item.id,
    {
      upstream_model_id: model.modelId,
    },
    session,
    request,
  );
  assert(presetImported.item.status === 'draft', 'preset import should create a draft');
  assert(
    presetImported.item.source_kind === 'openai_official',
    'preset import should preserve template source_kind',
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
          'template_bootstrap_flags_are_exposed',
          'official_templates_include_source_metadata',
          'runtime_publish_status_is_declared',
          'team_preset_can_be_cloned_from_template',
          'compatible_template_is_minimal',
          'template_import_creates_draft',
          'preset_import_creates_draft',
          'draft_import_does_not_change_public_profile',
          'imported_template_lints_and_previews',
          'revision_diff_reports_active_changes',
          'openai_compatible_copy_requires_provider_review',
          'openai_compatible_copy_blocks_suspect_fields',
          'activation_updates_public_profile',
        ],
        profile_id: profile.id,
        active_before_revision_id: originalActive.id,
        imported_revision_id: imported.item.id,
        preset_id: presetClone.item.id,
        preset_import_revision_id: presetImported.item.id,
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
