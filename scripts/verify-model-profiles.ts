import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CheckFailure {
  model_id?: string;
  profile_id?: string;
  revision_id?: string;
  check: string;
  message: string;
}

type JsonObject = Record<string, unknown>;

async function main() {
  const failures: CheckFailure[] = [];
  const imageModels = await prisma.aiModel.findMany({
    where: {
      modality: 'image',
      isEnabled: true,
      deletedAt: null,
    },
    include: {
      executionProfiles: {
        where: {
          deletedAt: null,
          isEnabled: true,
        },
        include: {
          revisions: {
            where: {
              status: 'active',
            },
            orderBy: {
              revisionNo: 'desc',
            },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (imageModels.length === 0) {
    failures.push({
      check: 'enabled_image_models',
      message: '没有启用的 image 模型；请先运行 npm run db:init:m0。',
    });
  }

  for (const model of imageModels) {
    const defaultProfiles = model.executionProfiles.filter((profile) => profile.isDefault);
    if (defaultProfiles.length !== 1) {
      failures.push({
        model_id: model.modelId,
        check: 'default_profile_count',
        message: `启用 image 模型必须且只能有一个默认 profile，当前为 ${defaultProfiles.length} 个。`,
      });
      continue;
    }

    const profile = defaultProfiles[0]!;
    validateProfile(model.modelId, profile, failures);
    validateRoutingRole(
      model.modelId,
      profile.id,
      profile.routingRole,
      'default profile',
      failures,
    );

    const activeRevisions = profile.revisions.filter((revision) => revision.status === 'active');
    if (activeRevisions.length !== 1) {
      failures.push({
        model_id: model.modelId,
        profile_id: profile.id,
        check: 'active_revision_count',
        message: `默认 profile 必须且只能有一个 active revision，当前为 ${activeRevisions.length} 个。`,
      });
      continue;
    }

    validateRevision(model.modelId, profile.id, activeRevisions[0]!, failures);

    const referenceEditProfiles = model.executionProfiles.filter(
      (candidate) =>
        candidate.routingRole === 'reference_edit' &&
        candidate.isEnabled &&
        candidate.deletedAt === null,
    );
    if (referenceEditProfiles.length > 1) {
      failures.push({
        model_id: model.modelId,
        check: 'reference_edit_profile_count',
        message: `同一模型最多只能有一个启用的 reference_edit profile，当前为 ${referenceEditProfiles.length} 个。`,
      });
    }
  }

  if (failures.length > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          failures,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        'enabled_image_models_have_one_default_profile',
        'default_profile_has_one_active_revision',
        'profile_has_adapter_key',
        'profile_has_parameter_schema',
        'profile_has_request_mapping',
        'default_profile_has_primary_generation_role_or_null',
        'active_revision_has_adapter_key',
        'active_revision_has_parameter_schema',
        'active_revision_has_request_mapping',
        'schema_v2_quick_slots_present',
      ],
      image_models: imageModels.map((model) => ({
        id: model.id,
        model_id: model.modelId,
        default_profile_id: model.executionProfiles.find((profile) => profile.isDefault)?.id,
        active_revision_id: model.executionProfiles
          .find((profile) => profile.isDefault)
          ?.revisions.find((revision) => revision.status === 'active')?.id,
      })),
    }),
  );
}

function validateProfile(
  modelId: string,
  profile: {
    id: string;
    routingRole: string | null;
    adapterKey: string;
    adapterVersion: string;
    parameterSchema: unknown;
    requestMapping: unknown;
    responseParserKey: string;
  },
  failures: CheckFailure[],
) {
  validateExecutionConfig(
    {
      modelId,
      profileId: profile.id,
      revisionId: undefined,
      adapterKey: profile.adapterKey,
      adapterVersion: profile.adapterVersion,
      parameterSchema: profile.parameterSchema,
      requestMapping: profile.requestMapping,
      responseParserKey: profile.responseParserKey,
    },
    failures,
  );
}

function validateRevision(
  modelId: string,
  profileId: string,
  revision: {
    id: string;
    routingRole: string | null;
    adapterKey: string;
    adapterVersion: string;
    parameterSchema: unknown;
    requestMapping: unknown;
    responseParserKey: string;
    sourceUrl: string | null;
    sourceCheckedAt: Date | null;
  },
  failures: CheckFailure[],
) {
  validateRoutingRole(modelId, profileId, revision.routingRole, 'active revision', failures);
  validateExecutionConfig(
    {
      modelId,
      profileId,
      revisionId: revision.id,
      adapterKey: revision.adapterKey,
      adapterVersion: revision.adapterVersion,
      parameterSchema: revision.parameterSchema,
      requestMapping: revision.requestMapping,
      responseParserKey: revision.responseParserKey,
    },
    failures,
  );

  if (!revision.sourceUrl) {
    failures.push({
      model_id: modelId,
      profile_id: profileId,
      revision_id: revision.id,
      check: 'revision_source_url',
      message: 'active revision 必须记录 source_url。',
    });
  }

  if (!revision.sourceCheckedAt) {
    failures.push({
      model_id: modelId,
      profile_id: profileId,
      revision_id: revision.id,
      check: 'revision_source_checked_at',
      message: 'active revision 必须记录 source_checked_at。',
    });
  }
}

function validateRoutingRole(
  modelId: string,
  profileId: string,
  routingRole: string | null,
  target: string,
  failures: CheckFailure[],
) {
  if (
    routingRole === null ||
    routingRole === 'primary_generation' ||
    routingRole === 'reference_edit'
  ) {
    return;
  }
  failures.push({
    model_id: modelId,
    profile_id: profileId,
    check: 'routing_role',
    message: `${target} routing_role 不合法：${routingRole}`,
  });
}

function validateExecutionConfig(
  input: {
    modelId: string;
    profileId: string;
    revisionId?: string;
    adapterKey: string;
    adapterVersion: string;
    parameterSchema: unknown;
    requestMapping: unknown;
    responseParserKey: string;
  },
  failures: CheckFailure[],
) {
  const context = {
    model_id: input.modelId,
    profile_id: input.profileId,
    revision_id: input.revisionId,
  };

  if (!input.adapterKey.trim()) {
    failures.push({
      ...context,
      check: 'adapter_key',
      message: 'adapter_key 不能为空。',
    });
  }

  if (!input.adapterVersion.trim()) {
    failures.push({
      ...context,
      check: 'adapter_version',
      message: 'adapter_version 不能为空。',
    });
  }

  if (!input.responseParserKey.trim()) {
    failures.push({
      ...context,
      check: 'response_parser_key',
      message: 'response_parser_key 不能为空。',
    });
  }

  const schema = Array.isArray(input.parameterSchema) ? input.parameterSchema : [];
  if (schema.length === 0) {
    failures.push({
      ...context,
      check: 'parameter_schema',
      message: 'parameter_schema 必须至少包含一个字段。',
    });
  }

  const mapping = isObject(input.requestMapping) ? input.requestMapping : null;
  if (!mapping || !Array.isArray(mapping.fields) || mapping.fields.length === 0) {
    failures.push({
      ...context,
      check: 'request_mapping',
      message: 'request_mapping.fields 必须至少包含一个映射字段。',
    });
  }

  const quickSlots = new Set(
    schema
      .map((field) => (isObject(field) && isObject(field.ui) ? field.ui.slot : undefined))
      .filter((slot): slot is string => typeof slot === 'string'),
  );
  for (const slot of ['count', 'resolution']) {
    if (!quickSlots.has(slot)) {
      failures.push({
        ...context,
        check: 'schema_v2_quick_slot',
        message: `parameter_schema 缺少 ui.slot=${slot} 的快捷参数字段。`,
      });
    }
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
