import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  type AiModel,
  ExecutionProfileOperation,
  ExecutionProfileRevisionStatus,
  ExecutionProfileSourceKind,
  ModelEndpointType,
  ModelModality,
  Prisma,
  PrismaClient,
  ReferenceTransferMode,
  type AiModelExecutionProfile,
} from '@prisma/client';

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
const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2';
const DEFAULT_IMAGE_PROFILE_NAME = 'OpenAI Image generation';
const DEFAULT_GEMINI_PROFILE_NAME = 'Gemini Interactions image';
const DEFAULT_IMAGE_ADAPTER_KEY = 'openai_images_generation';
const DEFAULT_IMAGE_ADAPTER_VERSION = '1';
const DEFAULT_IMAGE_RESPONSE_PARSER_KEY = 'openai_image_data';
const DEFAULT_GEMINI_ADAPTER_KEY = 'gemini_interactions_image';
const DEFAULT_GEMINI_ADAPTER_VERSION = '1';
const DEFAULT_GEMINI_RESPONSE_PARSER_KEY = 'gemini_inline_data';
const DEFAULT_IMAGE_SOURCE_URL = 'https://developers.openai.com/api/docs/guides/image-generation';
const DEFAULT_GEMINI_SOURCE_URL = 'https://ai.google.dev/gemini-api/docs/image-generation';
const DEFAULT_IMAGE_SOURCE_CHECKED_AT = new Date('2026-06-21T00:00:00.000Z');
const DEFAULT_GEMINI_SOURCE_CHECKED_AT = new Date('2026-06-22T00:00:00.000Z');

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

const defaultImageParameterSchema = [
  {
    key: 'n',
    label: '张数',
    type: 'integer',
    description: '一次请求生成的图片数量。',
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
    help_url: DEFAULT_IMAGE_SOURCE_URL,
  },
  {
    key: 'size',
    label: '分辨率',
    type: 'select',
    description: 'OpenAI Image API 支持通过 size 指定分辨率；开发期模板先列出官方常用尺寸。',
    required: false,
    default: '1024x1024',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: '1024 x 1024', value: '1024x1024' },
      { label: '1536 x 1024', value: '1536x1024' },
      { label: '1024 x 1536', value: '1024x1536' },
      { label: '2048 x 2048', value: '2048x2048' },
      { label: '2048 x 1152', value: '2048x1152' },
      { label: '3840 x 2160', value: '3840x2160' },
      { label: '2160 x 3840', value: '2160x3840' },
    ],
    ui: {
      group: 'quick',
      slot: 'resolution',
      order: 20,
    },
    capability: 'resolution',
    send_policy: 'when_present',
    validation: {
      enum: [
        'auto',
        '1024x1024',
        '1536x1024',
        '1024x1536',
        '2048x2048',
        '2048x1152',
        '3840x2160',
        '2160x3840',
      ],
    },
    help_url: DEFAULT_IMAGE_SOURCE_URL,
  },
  {
    key: 'quality',
    label: '质量',
    type: 'select',
    description: '渲染质量。',
    required: false,
    default: 'auto',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ],
    ui: {
      group: 'advanced',
      slot: 'quality',
      order: 30,
    },
    capability: 'quality',
    send_policy: 'when_present',
    validation: {
      enum: ['auto', 'low', 'medium', 'high'],
    },
    help_url: DEFAULT_IMAGE_SOURCE_URL,
  },
  {
    key: 'output_format',
    label: '输出格式',
    type: 'select',
    description: 'Image API 默认返回 PNG，也可请求 JPEG 或 WebP。',
    required: false,
    default: 'png',
    options: [
      { label: 'PNG', value: 'png' },
      { label: 'JPEG', value: 'jpeg' },
      { label: 'WebP', value: 'webp' },
    ],
    ui: {
      group: 'advanced',
      slot: 'format',
      order: 40,
    },
    capability: 'format',
    send_policy: 'when_present',
    validation: {
      enum: ['png', 'jpeg', 'webp'],
    },
    help_url: DEFAULT_IMAGE_SOURCE_URL,
  },
  {
    key: 'output_compression',
    label: '输出压缩',
    type: 'integer',
    description: 'JPEG/WebP 输出压缩级别，范围 0-100。',
    required: false,
    default: 100,
    min: 0,
    max: 100,
    ui: {
      group: 'advanced',
      slot: 'format',
      order: 50,
    },
    capability: 'format',
    send_policy: 'when_present',
    validation: {
      min: 0,
      max: 100,
    },
    help_url: DEFAULT_IMAGE_SOURCE_URL,
  },
  {
    key: 'background',
    label: '背景',
    type: 'select',
    description:
      '默认模板只开放 auto 和 opaque；transparent 需要模型文档明确支持后再建新 revision。',
    required: false,
    default: 'auto',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'Opaque', value: 'opaque' },
    ],
    ui: {
      group: 'advanced',
      slot: 'background',
      order: 60,
    },
    capability: 'background',
    send_policy: 'when_present',
    validation: {
      enum: ['auto', 'opaque'],
    },
    help_url: DEFAULT_IMAGE_SOURCE_URL,
  },
  {
    key: 'moderation',
    label: '内容审核',
    type: 'select',
    description: '控制图片生成审核严格程度。',
    required: false,
    default: 'auto',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'Low', value: 'low' },
    ],
    ui: {
      group: 'advanced',
      slot: 'safety',
      order: 70,
    },
    capability: 'safety',
    send_policy: 'when_present',
    validation: {
      enum: ['auto', 'low'],
    },
    help_url: DEFAULT_IMAGE_SOURCE_URL,
  },
] satisfies Prisma.InputJsonArray;

const defaultImageModelParameterSchema = defaultImageParameterSchema.map((field) => ({
  key: field.key,
  label: field.label,
  type: field.type,
  description: field.description,
  required: field.required,
  default: field.default,
  ...(field.min === undefined ? {} : { min: field.min }),
  ...(field.max === undefined ? {} : { max: field.max }),
  ...(field.options === undefined ? {} : { options: field.options }),
})) satisfies Prisma.InputJsonArray;

const defaultImageDefaultParams = {
  n: 1,
  size: '1024x1024',
  quality: 'auto',
  output_format: 'png',
  output_compression: 100,
  background: 'auto',
  moderation: 'auto',
} satisfies Prisma.InputJsonObject;

const defaultImageRequestMapping = {
  content_type: 'json',
  fields: [
    { source: 'model', target: 'model' },
    { source: 'prompt', target: 'prompt' },
    { source: 'params.n', target: 'n', omit_if_null: true },
    { source: 'params.size', target: 'size', omit_if_null: true },
    { source: 'params.quality', target: 'quality', omit_if_null: true },
    { source: 'params.output_format', target: 'output_format', omit_if_null: true },
    { source: 'params.output_compression', target: 'output_compression', omit_if_null: true },
    { source: 'params.background', target: 'background', omit_if_null: true },
    { source: 'params.moderation', target: 'moderation', omit_if_null: true },
  ],
} satisfies Prisma.InputJsonObject;

const defaultImageCapabilities = {
  supports_reference_image: false,
  max_reference_images: 0,
  supports_streaming: false,
  output_formats: ['png', 'jpeg', 'webp'],
  transparent_background: false,
} satisfies Prisma.InputJsonObject;

const defaultImageValidationRules = {
  version: 1,
  notes: [
    'The development seed only exposes conservative OpenAI Image generation parameters.',
    'Transparent backgrounds must be enabled by a model-specific profile revision after source verification.',
  ],
} satisfies Prisma.InputJsonObject;

const defaultGeminiParameterSchema = [
  {
    key: 'aspect_ratio',
    label: '比例',
    type: 'select',
    description: 'Gemini image aspect ratio.',
    required: false,
    default: '1:1',
    options: [
      { label: '1:1', value: '1:1' },
      { label: '2:3', value: '2:3' },
      { label: '3:2', value: '3:2' },
      { label: '3:4', value: '3:4' },
      { label: '4:3', value: '4:3' },
      { label: '9:16', value: '9:16' },
      { label: '16:9', value: '16:9' },
    ],
    ui: {
      group: 'quick',
      slot: 'aspect_ratio',
      order: 10,
    },
    capability: 'aspect_ratio',
    send_policy: 'when_present',
    validation: {
      enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
    },
    help_url: DEFAULT_GEMINI_SOURCE_URL,
  },
  {
    key: 'image_size',
    label: '图片尺寸',
    type: 'select',
    description: 'Gemini image size tier.',
    required: false,
    default: '1K',
    options: [
      { label: '1K', value: '1K' },
      { label: '2K', value: '2K' },
      { label: '4K', value: '4K' },
    ],
    ui: {
      group: 'quick',
      slot: 'resolution',
      order: 20,
    },
    capability: 'image_size',
    send_policy: 'when_present',
    validation: {
      enum: ['1K', '2K', '4K'],
    },
    help_url: DEFAULT_GEMINI_SOURCE_URL,
  },
] satisfies Prisma.InputJsonArray;

const defaultGeminiRequestMapping = {
  content_type: 'json',
  fields: [
    { source: 'prompt', target: 'contents[0].parts[0].text' },
    {
      source: 'params.aspect_ratio',
      target: 'generationConfig.responseFormat.image.aspectRatio',
      omit_if_null: true,
    },
    {
      source: 'params.image_size',
      target: 'generationConfig.responseFormat.image.imageSize',
      omit_if_null: true,
    },
  ],
  constants: [{ target: 'generationConfig.responseModalities', value: ['IMAGE'] }],
} satisfies Prisma.InputJsonObject;

const defaultGeminiCapabilities = {
  supports_reference_image: true,
  max_reference_images: 8,
  supports_streaming: false,
  response_parser: 'gemini_inline_data',
  template_origin: 'gemini_official',
  requires_gateway_support: true,
} satisfies Prisma.InputJsonObject;

const defaultGeminiValidationRules = {
  version: 1,
  notes: [
    'Gemini Interactions stays disabled until the configured gateway supports /v1beta/interactions.',
    'Aspect ratio and image size map to Gemini response_format image fields.',
  ],
} satisfies Prisma.InputJsonObject;

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
  const defaultImageModel = await ensureDefaultImageModel();
  const defaultGeminiProfile = await ensureDefaultGeminiExecutionProfileForImageModel();
  const defaultImageProfiles = await ensureDefaultOpenAiGenerationProfiles();

  console.log(
    JSON.stringify({
      level: 'info',
      module: 'init',
      event: 'm0_initialized',
      settings: defaultSettings.length,
      local_storage_root: localStorageRoot,
      initial_admin: initialAdmin,
      default_image_model: defaultImageModel,
      default_gemini_profile: defaultGeminiProfile,
      default_image_profiles: defaultImageProfiles,
    }),
  );
}

async function ensureDefaultImageModel() {
  const model = await prisma.aiModel.upsert({
    where: {
      id: '00000000-0000-4000-8000-00000000f201',
    },
    create: {
      id: '00000000-0000-4000-8000-00000000f201',
      modelId: DEFAULT_IMAGE_MODEL_ID,
      displayName: 'GPT Image 2',
      providerName: 'OpenAI',
      modality: ModelModality.image,
      description:
        'Development default GPT Image generation model. Execution rules live in the default active profile revision.',
      endpointTypes: [
        ModelEndpointType.openai_image_generations,
        ModelEndpointType.openai_responses_image,
        ModelEndpointType.gemini_interactions_image,
        ModelEndpointType.gemini_generate_content,
      ],
      referenceTransferMode: ReferenceTransferMode.none,
      supportsReferenceImage: false,
      isEnabled: true,
      isRecommended: true,
      sortOrder: -1000,
      defaultParams: defaultImageDefaultParams,
      parameterSchema: defaultImageModelParameterSchema,
    },
    update: {
      displayName: 'GPT Image 2',
      providerName: 'OpenAI',
      modality: ModelModality.image,
      description:
        'Development default GPT Image generation model. Execution rules live in the default active profile revision.',
      endpointTypes: [
        ModelEndpointType.openai_image_generations,
        ModelEndpointType.openai_responses_image,
        ModelEndpointType.gemini_interactions_image,
        ModelEndpointType.gemini_generate_content,
      ],
      referenceTransferMode: ReferenceTransferMode.none,
      supportsReferenceImage: false,
      isEnabled: true,
      isRecommended: true,
      sortOrder: -1000,
      defaultParams: defaultImageDefaultParams,
      parameterSchema: defaultImageModelParameterSchema,
      deletedAt: null,
    },
  });

  const profile = await upsertDefaultImageExecutionProfile(model);
  const revision = await upsertDefaultImageExecutionProfileRevision(profile, model);

  return {
    model_id: model.modelId,
    model_record_id: model.id,
    execution_profile_id: profile.id,
    active_revision_id: revision.id,
  };
}

async function upsertDefaultImageExecutionProfile(
  model: Pick<AiModel, 'id' | 'modelId'>,
): Promise<AiModelExecutionProfile> {
  const existingProfile = await prisma.aiModelExecutionProfile.findFirst({
    where: {
      aiModelId: model.id,
      name: DEFAULT_IMAGE_PROFILE_NAME,
      deletedAt: null,
    },
  });

  const data = {
    aiModelId: model.id,
    name: DEFAULT_IMAGE_PROFILE_NAME,
    operation: ExecutionProfileOperation.text_to_image,
    adapterKey: DEFAULT_IMAGE_ADAPTER_KEY,
    adapterVersion: DEFAULT_IMAGE_ADAPTER_VERSION,
    transportKey: 'new_api_bearer',
    upstreamModelId: model.modelId,
    upstreamEndpointPath: '/v1/images/generations',
    referenceTransferMode: ReferenceTransferMode.none,
    supportsReferenceImage: false,
    maxReferenceImages: 0,
    parameterSchema: defaultImageParameterSchema,
    defaultParams: defaultImageDefaultParams,
    requestMapping: defaultImageRequestMapping,
    responseParserKey: DEFAULT_IMAGE_RESPONSE_PARSER_KEY,
    capabilities: defaultImageCapabilities,
    validationRules: defaultImageValidationRules,
    isDefault: true,
    isEnabled: true,
    sortOrder: 0,
    deletedAt: null,
  };

  await prisma.aiModelExecutionProfile.updateMany({
    where: {
      aiModelId: model.id,
      isDefault: true,
      ...(existingProfile ? { id: { not: existingProfile.id } } : {}),
    },
    data: {
      isDefault: false,
    },
  });

  if (existingProfile) {
    return prisma.aiModelExecutionProfile.update({
      where: {
        id: existingProfile.id,
      },
      data,
    });
  }

  return prisma.aiModelExecutionProfile.create({
    data,
  });
}

async function upsertDefaultImageExecutionProfileRevision(
  profile: AiModelExecutionProfile,
  model: Pick<AiModel, 'modelId' | 'providerName'>,
) {
  const now = new Date();
  const sourceMetadata = getOpenAiGenerationSourceMetadata(model);

  await prisma.aiModelExecutionProfileRevision.updateMany({
    where: {
      executionProfileId: profile.id,
      status: ExecutionProfileRevisionStatus.active,
      revisionNo: {
        not: 1,
      },
    },
    data: {
      status: ExecutionProfileRevisionStatus.archived,
      archivedAt: now,
    },
  });

  return prisma.aiModelExecutionProfileRevision.upsert({
    where: {
      executionProfileId_revisionNo: {
        executionProfileId: profile.id,
        revisionNo: 1,
      },
    },
    create: {
      executionProfileId: profile.id,
      revisionNo: 1,
      status: ExecutionProfileRevisionStatus.active,
      sourceKind: sourceMetadata.sourceKind,
      sourceUrl: sourceMetadata.sourceUrl,
      sourceCheckedAt: DEFAULT_IMAGE_SOURCE_CHECKED_AT,
      sourceSummary: sourceMetadata.sourceSummary,
      adapterKey: DEFAULT_IMAGE_ADAPTER_KEY,
      adapterVersion: DEFAULT_IMAGE_ADAPTER_VERSION,
      transportKey: 'new_api_bearer',
      upstreamModelId: model.modelId,
      upstreamEndpointPath: '/v1/images/generations',
      referenceTransferMode: ReferenceTransferMode.none,
      supportsReferenceImage: false,
      maxReferenceImages: 0,
      parameterSchema: defaultImageParameterSchema,
      defaultParams: defaultImageDefaultParams,
      requestMapping: defaultImageRequestMapping,
      responseParserKey: DEFAULT_IMAGE_RESPONSE_PARSER_KEY,
      capabilities: defaultImageCapabilities,
      validationRules: defaultImageValidationRules,
      changeSummary: 'Initial development default OpenAI Image generation profile.',
      activatedAt: now,
    },
    update: {
      status: ExecutionProfileRevisionStatus.active,
      sourceKind: sourceMetadata.sourceKind,
      sourceUrl: sourceMetadata.sourceUrl,
      sourceCheckedAt: DEFAULT_IMAGE_SOURCE_CHECKED_AT,
      sourceSummary: sourceMetadata.sourceSummary,
      adapterKey: DEFAULT_IMAGE_ADAPTER_KEY,
      adapterVersion: DEFAULT_IMAGE_ADAPTER_VERSION,
      transportKey: 'new_api_bearer',
      upstreamModelId: model.modelId,
      upstreamEndpointPath: '/v1/images/generations',
      referenceTransferMode: ReferenceTransferMode.none,
      supportsReferenceImage: false,
      maxReferenceImages: 0,
      parameterSchema: defaultImageParameterSchema,
      defaultParams: defaultImageDefaultParams,
      requestMapping: defaultImageRequestMapping,
      responseParserKey: DEFAULT_IMAGE_RESPONSE_PARSER_KEY,
      capabilities: defaultImageCapabilities,
      validationRules: defaultImageValidationRules,
      changeSummary: 'Initial development default OpenAI Image generation profile.',
      activatedAt: now,
      archivedAt: null,
    },
  });
}

async function ensureDefaultGeminiExecutionProfileForImageModel() {
  const model = await prisma.aiModel.findUniqueOrThrow({
    where: {
      id: '00000000-0000-4000-8000-00000000f201',
    },
  });
  const profile = await upsertDefaultGeminiExecutionProfile(model);
  const revision = await upsertDefaultGeminiExecutionProfileRevision(profile);
  return {
    model_id: model.modelId,
    model_record_id: model.id,
    execution_profile_id: profile.id,
    active_revision_id: revision.id,
  };
}

async function upsertDefaultGeminiExecutionProfile(
  model: Pick<AiModel, 'id'>,
): Promise<AiModelExecutionProfile> {
  const existingProfile = await prisma.aiModelExecutionProfile.findFirst({
    where: {
      aiModelId: model.id,
      name: DEFAULT_GEMINI_PROFILE_NAME,
      deletedAt: null,
    },
  });

  const data = {
    aiModelId: model.id,
    name: DEFAULT_GEMINI_PROFILE_NAME,
    operation: ExecutionProfileOperation.image_to_image,
    adapterKey: DEFAULT_GEMINI_ADAPTER_KEY,
    adapterVersion: DEFAULT_GEMINI_ADAPTER_VERSION,
    transportKey: 'new_api_bearer',
    upstreamModelId: 'gemini-3-pro-image-preview',
    upstreamEndpointPath: '/v1beta/interactions',
    referenceTransferMode: ReferenceTransferMode.url,
    supportsReferenceImage: true,
    maxReferenceImages: 8,
    parameterSchema: defaultGeminiParameterSchema,
    defaultParams: {
      aspect_ratio: '1:1',
      image_size: '1K',
    },
    requestMapping: defaultGeminiRequestMapping,
    responseParserKey: DEFAULT_GEMINI_RESPONSE_PARSER_KEY,
    capabilities: defaultGeminiCapabilities,
    validationRules: defaultGeminiValidationRules,
    isDefault: false,
    isEnabled: false,
    sortOrder: 50,
    deletedAt: null,
  };

  if (existingProfile) {
    return prisma.aiModelExecutionProfile.update({
      where: {
        id: existingProfile.id,
      },
      data,
    });
  }

  return prisma.aiModelExecutionProfile.create({
    data,
  });
}

async function upsertDefaultGeminiExecutionProfileRevision(profile: AiModelExecutionProfile) {
  const now = new Date();

  await prisma.aiModelExecutionProfileRevision.updateMany({
    where: {
      executionProfileId: profile.id,
      status: ExecutionProfileRevisionStatus.active,
      revisionNo: {
        not: 1,
      },
    },
    data: {
      status: ExecutionProfileRevisionStatus.archived,
      archivedAt: now,
    },
  });

  return prisma.aiModelExecutionProfileRevision.upsert({
    where: {
      executionProfileId_revisionNo: {
        executionProfileId: profile.id,
        revisionNo: 1,
      },
    },
    create: {
      executionProfileId: profile.id,
      revisionNo: 1,
      status: ExecutionProfileRevisionStatus.active,
      sourceKind: ExecutionProfileSourceKind.gemini_official,
      sourceUrl: DEFAULT_GEMINI_SOURCE_URL,
      sourceCheckedAt: DEFAULT_GEMINI_SOURCE_CHECKED_AT,
      sourceSummary:
        'Gemini official image generation guide snapshot: Interactions is the preferred path for gemini-3-pro-image-preview and newer models, using input parts and response_format image controls.',
      adapterKey: DEFAULT_GEMINI_ADAPTER_KEY,
      adapterVersion: DEFAULT_GEMINI_ADAPTER_VERSION,
      transportKey: 'new_api_bearer',
      upstreamModelId: 'gemini-3-pro-image-preview',
      upstreamEndpointPath: '/v1beta/interactions',
      referenceTransferMode: ReferenceTransferMode.url,
      supportsReferenceImage: true,
      maxReferenceImages: 8,
      parameterSchema: defaultGeminiParameterSchema,
      defaultParams: {
        aspect_ratio: '1:1',
        image_size: '1K',
      },
      requestMapping: defaultGeminiRequestMapping,
      responseParserKey: DEFAULT_GEMINI_RESPONSE_PARSER_KEY,
      capabilities: defaultGeminiCapabilities,
      validationRules: defaultGeminiValidationRules,
      changeSummary: 'Initial development Gemini Interactions image profile.',
      activatedAt: now,
    },
    update: {
      status: ExecutionProfileRevisionStatus.active,
      sourceKind: ExecutionProfileSourceKind.gemini_official,
      sourceUrl: DEFAULT_GEMINI_SOURCE_URL,
      sourceCheckedAt: DEFAULT_GEMINI_SOURCE_CHECKED_AT,
      sourceSummary:
        'Gemini official image generation guide snapshot: Interactions is the preferred path for gemini-3-pro-image-preview and newer models, using input parts and response_format image controls.',
      adapterKey: DEFAULT_GEMINI_ADAPTER_KEY,
      adapterVersion: DEFAULT_GEMINI_ADAPTER_VERSION,
      transportKey: 'new_api_bearer',
      upstreamModelId: 'gemini-3-pro-image-preview',
      upstreamEndpointPath: '/v1beta/interactions',
      referenceTransferMode: ReferenceTransferMode.url,
      supportsReferenceImage: true,
      maxReferenceImages: 8,
      parameterSchema: defaultGeminiParameterSchema,
      defaultParams: {
        aspect_ratio: '1:1',
        image_size: '1K',
      },
      requestMapping: defaultGeminiRequestMapping,
      responseParserKey: DEFAULT_GEMINI_RESPONSE_PARSER_KEY,
      capabilities: defaultGeminiCapabilities,
      validationRules: defaultGeminiValidationRules,
      changeSummary: 'Initial development Gemini Interactions image profile.',
      activatedAt: now,
      archivedAt: null,
    },
  });
}

function getOpenAiGenerationSourceMetadata(model: Pick<AiModel, 'modelId' | 'providerName'>) {
  const provider = model.providerName?.trim().toLowerCase() ?? '';
  const isOpenAiOfficial = provider === 'openai';

  if (isOpenAiOfficial) {
    return {
      sourceKind: ExecutionProfileSourceKind.openai_official,
      sourceUrl: DEFAULT_IMAGE_SOURCE_URL,
      sourceSummary:
        'OpenAI Image generation guide snapshot: GPT Image models support Image API generation/edit; the development template exposes conservative generation controls for size, quality, output format, compression, moderation, and non-transparent background.',
    };
  }

  return {
    sourceKind: ExecutionProfileSourceKind.third_party_docs,
    sourceUrl: 'https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-image.md',
    sourceSummary:
      'Development OpenAI-compatible generation profile seeded from the current model record and new-api OpenAI Image compatibility path. Replace with vendor-specific docs before production use.',
  };
}

async function ensureDefaultOpenAiGenerationProfiles() {
  const models = await prisma.aiModel.findMany({
    where: {
      modality: ModelModality.image,
      isEnabled: true,
      deletedAt: null,
      endpointTypes: {
        has: ModelEndpointType.openai_image_generations,
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const results = [];
  for (const model of models) {
    const profile = await upsertDefaultImageExecutionProfile(model);
    const revision = await upsertDefaultImageExecutionProfileRevision(profile, model);
    results.push({
      model_id: model.modelId,
      model_record_id: model.id,
      execution_profile_id: profile.id,
      active_revision_id: revision.id,
    });
  }

  return results;
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
