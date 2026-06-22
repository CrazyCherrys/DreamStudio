import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ExecutionProfileOperation, ExecutionProfileSourceKind } from '@prisma/client';

import type {
  ExecutionProfileRevisionBody,
  ProfileTemplateCategory,
  ProfileTemplateImportMode,
  ProfileTemplateSummary,
} from './model-catalog.types';

export interface ProfileTemplateDefinition {
  id: string;
  label: string;
  description: string;
  category: ProfileTemplateCategory;
  tags: string[];
  compatible_copy_allowed: boolean;
  compatible_warning: string;
  revision: ProfileTemplateRevision;
}

interface ProfileTemplateRevision {
  source_kind?: ExecutionProfileSourceKind | null;
  source_url?: string | null;
  source_checked_at?: string | null;
  source_summary?: string | null;
  adapter_key: string;
  adapter_version: string;
  transport_key: string;
  upstream_model_id: string;
  upstream_endpoint_path?: string | null;
  reference_transfer_mode: string;
  supports_reference_image: boolean;
  max_reference_images: number;
  parameter_schema: unknown;
  default_params: unknown;
  request_mapping: unknown;
  response_parser_key: string;
  capabilities: unknown;
  validation_rules: unknown;
  change_summary?: string | null;
}

interface ProfileTemplateJson {
  id: string;
  label: string;
  description: string;
  category: ProfileTemplateCategory;
  tags: string[];
  compatible_copy_allowed: boolean;
  compatible_warning: string;
  revision: ProfileTemplateRevision;
}

const TEMPLATE_FILENAMES = [
  'openai-image-generation-gpt-image-2.json',
  'openai-image-edit-gpt-image-2.json',
  'openai-responses-image-tool.json',
  'gemini-generate-content-image.json',
  'openai-compatible-image-generation-minimal.json',
];

const TEMPLATE_ROOT = findTemplateRoot(process.cwd());

const profileTemplates = TEMPLATE_FILENAMES.map((filename) =>
  readProfileTemplate(join(TEMPLATE_ROOT, filename)),
);

export function listProfileTemplates(): ProfileTemplateSummary[] {
  return profileTemplates.map((template) => serializeTemplateSummary(template));
}

export function findProfileTemplate(templateId: string): ProfileTemplateDefinition | null {
  return profileTemplates.find((template) => template.id === templateId) ?? null;
}

export function buildTemplateRevisionBody(
  template: ProfileTemplateDefinition,
  options: {
    mode: ProfileTemplateImportMode;
    upstreamModelId: string;
  },
): ExecutionProfileRevisionBody {
  const revision = structuredClone(template.revision);
  revision.upstream_model_id = options.upstreamModelId;
  if (options.mode === 'openai_compatible_copy') {
    revision.source_kind = 'third_party_docs';
    revision.source_summary =
      `${revision.source_summary ?? ''}\n\nOpenAI-compatible copy: verify and delete every unconfirmed parameter before publishing.`.trim();
    revision.capabilities = {
      ...(isRecord(revision.capabilities) ? revision.capabilities : {}),
      template_origin: 'openai_compatible_copy',
      requires_provider_field_review: true,
    };
    revision.validation_rules = {
      ...(isRecord(revision.validation_rules) ? revision.validation_rules : {}),
      warnings: [
        ...(Array.isArray((revision.validation_rules as { warnings?: unknown[] }).warnings)
          ? (revision.validation_rules as { warnings: unknown[] }).warnings
          : []),
        'OpenAI-compatible does not imply OpenAI-full-compatible.',
        'Delete every field not explicitly supported by the target channel before activation.',
      ],
    };
    revision.change_summary =
      'Copied OpenAI official template into an OpenAI-compatible draft; remove unconfirmed fields before publishing.';
  }
  return revision;
}

function serializeTemplateSummary(template: ProfileTemplateDefinition): ProfileTemplateSummary {
  return {
    id: template.id,
    label: template.label,
    description: template.description,
    category: template.category,
    tags: template.tags,
    source_kind: readOptionalSourceKind(template.revision.source_kind),
    source_url: readOptionalString(template.revision.source_url),
    source_checked_at: readOptionalString(template.revision.source_checked_at),
    adapter_key: template.revision.adapter_key,
    operation: operationFromAdapterKey(template.revision.adapter_key),
    compatible_copy_allowed: template.compatible_copy_allowed,
    compatible_warning: template.compatible_warning,
  };
}

function readProfileTemplate(path: string): ProfileTemplateDefinition {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Invalid profile template: ${path}`);
  }
  assertString(parsed.id, path, 'id');
  assertString(parsed.label, path, 'label');
  assertString(parsed.description, path, 'description');
  assertString(parsed.category, path, 'category');
  if (
    parsed.category !== 'gemini_official' &&
    parsed.category !== 'openai_official' &&
    parsed.category !== 'openai_compatible'
  ) {
    throw new Error(`Invalid profile template category: ${path}`);
  }
  assertString(parsed.compatible_warning, path, 'compatible_warning');
  if (!Array.isArray(parsed.tags) || parsed.tags.some((tag) => typeof tag !== 'string')) {
    throw new Error(`Invalid profile template tags: ${path}`);
  }
  if (typeof parsed.compatible_copy_allowed !== 'boolean') {
    throw new Error(`Invalid profile template compatible_copy_allowed: ${path}`);
  }
  if (!isRecord(parsed.revision)) {
    throw new Error(`Invalid profile template revision: ${path}`);
  }
  assertString(parsed.revision.adapter_key, path, 'revision.adapter_key');
  assertString(parsed.revision.adapter_version, path, 'revision.adapter_version');
  assertString(parsed.revision.transport_key, path, 'revision.transport_key');
  assertString(parsed.revision.upstream_model_id, path, 'revision.upstream_model_id');
  assertString(parsed.revision.reference_transfer_mode, path, 'revision.reference_transfer_mode');
  assertString(parsed.revision.response_parser_key, path, 'revision.response_parser_key');
  if (typeof parsed.revision.supports_reference_image !== 'boolean') {
    throw new Error(`Invalid profile template revision.supports_reference_image: ${path}`);
  }
  if (typeof parsed.revision.max_reference_images !== 'number') {
    throw new Error(`Invalid profile template revision.max_reference_images: ${path}`);
  }

  return parsed as unknown as ProfileTemplateJson;
}

function findTemplateRoot(startDirectory: string) {
  let currentDirectory = startDirectory;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(currentDirectory, 'profile-templates');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(currentDirectory);
    if (parent === currentDirectory) {
      break;
    }
    currentDirectory = parent;
  }
  throw new Error(`Profile template directory not found from ${startDirectory}`);
}

function operationFromAdapterKey(adapterKey: string): ExecutionProfileOperation {
  if (adapterKey === 'openai_images_edit') {
    return 'image_edit';
  }
  if (adapterKey === 'openai_responses_image') {
    return 'conversational_image';
  }
  if (adapterKey === 'gemini_generate_content') {
    return 'image_to_image';
  }
  return 'text_to_image';
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readOptionalSourceKind(value: unknown): ExecutionProfileSourceKind | null {
  return typeof value === 'string' && value.trim() ? (value as ExecutionProfileSourceKind) : null;
}

function assertString(value: unknown, path: string, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid profile template ${field}: ${path}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
