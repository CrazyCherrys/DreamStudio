import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CheckFailure {
  model_id?: string;
  profile_id?: string;
  revision_id?: string;
  check: string;
  message: string;
}

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
            take: 1,
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

  const serializedModels = imageModels
    .map((model) => {
      const profile =
        model.executionProfiles.find((item) => item.isDefault && item.revisions.length === 1) ??
        null;
      if (!profile) {
        failures.push({
          model_id: model.modelId,
          check: 'public_default_execution_profile',
          message:
            '启用 image 模型必须有带 active revision 的默认 profile，公共模型 API 才能展示。',
        });
        return null;
      }

      const revision = profile.revisions[0]!;
      const parameterSchema = Array.isArray(revision.parameterSchema)
        ? revision.parameterSchema
        : [];
      const quickSlots = new Set(
        parameterSchema
          .map((field) => (isObject(field) && isObject(field.ui) ? field.ui.slot : undefined))
          .filter((slot): slot is string => typeof slot === 'string'),
      );
      for (const slot of ['count', 'resolution']) {
        if (!quickSlots.has(slot)) {
          failures.push({
            model_id: model.modelId,
            profile_id: profile.id,
            revision_id: revision.id,
            check: 'public_profile_schema_ui_slot',
            message: `default_execution_profile.parameter_schema 缺少 ui.slot=${slot}。`,
          });
        }
      }

      return {
        id: model.id,
        model_id: model.modelId,
        default_execution_profile: {
          id: profile.id,
          revision_id: revision.id,
          operation: profile.operation,
          adapter_key: revision.adapterKey,
          adapter_version: revision.adapterVersion,
          reference_transfer_mode: revision.referenceTransferMode,
          supports_reference_image: revision.supportsReferenceImage,
          max_reference_images: revision.maxReferenceImages,
          parameter_schema: parameterSchema,
          default_params: revision.defaultParams,
          capabilities: {
            ...(isObject(revision.capabilities) ? revision.capabilities : {}),
            supports_reference_image: revision.supportsReferenceImage,
            max_reference_images: revision.maxReferenceImages,
          },
        },
      };
    })
    .filter((model): model is NonNullable<typeof model> => model !== null);

  for (const model of serializedModels) {
    const profile = model.default_execution_profile;
    if (!profile.id || !profile.revision_id || !profile.adapter_key || !profile.adapter_version) {
      failures.push({
        model_id: model.model_id,
        profile_id: profile.id,
        revision_id: profile.revision_id,
        check: 'public_profile_identity_fields',
        message: 'default_execution_profile 缺少 id、revision_id、adapter_key 或 adapter_version。',
      });
    }

    if (!Array.isArray(profile.parameter_schema) || profile.parameter_schema.length === 0) {
      failures.push({
        model_id: model.model_id,
        profile_id: profile.id,
        revision_id: profile.revision_id,
        check: 'public_profile_parameter_schema',
        message: 'default_execution_profile.parameter_schema 必须是非空数组。',
      });
    }

    if (!isObject(profile.default_params)) {
      failures.push({
        model_id: model.model_id,
        profile_id: profile.id,
        revision_id: profile.revision_id,
        check: 'public_profile_default_params',
        message: 'default_execution_profile.default_params 必须是对象。',
      });
    }

    if (
      profile.capabilities.supports_reference_image !== profile.supports_reference_image ||
      profile.capabilities.max_reference_images !== profile.max_reference_images
    ) {
      failures.push({
        model_id: model.model_id,
        profile_id: profile.id,
        revision_id: profile.revision_id,
        check: 'public_profile_capabilities',
        message: 'capabilities 必须包含 profile 的 reference image 支持和 max_reference_images。',
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
    JSON.stringify(
      {
        ok: true,
        checks: [
          'public_image_models_have_default_execution_profile',
          'public_default_execution_profile_has_active_revision_identity',
          'public_default_execution_profile_uses_revision_parameter_schema',
          'public_default_execution_profile_preserves_schema_v2_ui_slots',
          'public_default_execution_profile_capabilities_include_reference_limits',
        ],
        image_models: serializedModels.map((model) => ({
          id: model.id,
          model_id: model.model_id,
          default_profile_id: model.default_execution_profile.id,
          active_revision_id: model.default_execution_profile.revision_id,
        })),
      },
      null,
      2,
    ),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
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
