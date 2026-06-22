'use client';

import { useEffect, useMemo, useState } from 'react';

import { DsButton, DsInput } from '@/components/ui';
import {
  activateExecutionProfileRevision,
  createExecutionProfile,
  createExecutionProfileRevision,
  diffExecutionProfileRevision,
  emptySchemaField,
  endpointTypeLabel,
  fetchExecutionProfiles,
  fetchProfileTemplates,
  importProfileTemplateRevision,
  lintExecutionProfileRevision,
  modalityLabel,
  previewExecutionProfileRevision,
  testExecutionProfileRevision,
  transferModeLabel,
  updateExecutionProfile,
  updateExecutionProfileRevision,
  type AdminExecutionProfile,
  type AdminExecutionProfileRevision,
  type AdminAiModel,
  type AiModelPayload,
  type ExecutionProfileOperation,
  type ExecutionProfilePayload,
  type ExecutionProfilePreviewResult,
  type ExecutionProfileRevisionPayload,
  type ExecutionProfileRevisionDiffResult,
  type ExecutionProfileSourceKind,
  type ModelEndpointType,
  type ModelModality,
  type ModelSyncSnapshotDetail,
  type ModelSyncSnapshotPayload,
  type ModelSyncSnapshotSummary,
  type ParameterFieldType,
  type ParameterSchemaOption,
  type ParameterSchemaField,
  type ProfileTemplateImportMode,
  type ProfileTemplateSummary,
  type ReferenceTransferMode,
  uploadModelIcon,
} from '@/lib/model-catalog';

const FIELD_TYPES: ParameterFieldType[] = ['string', 'number', 'integer', 'boolean', 'select'];
const UI_GROUPS = ['quick', 'advanced', 'hidden'] as const;
const UI_SLOTS = [
  'count',
  'aspect_ratio',
  'resolution',
  'quality',
  'format',
  'background',
  'style',
  'seed',
  'safety',
  'reference',
] as const;
const SEND_POLICIES = ['always', 'when_present', 'never'] as const;
const MODEL_MODALITIES: ModelModality[] = ['chat', 'image', 'video'];
const ENDPOINT_TYPES: ModelEndpointType[] = [
  'openai_image_generations',
  'openai_image_edits',
  'gemini_generate_content',
];
const TRANSFER_MODES: ReferenceTransferMode[] = ['none', 'multipart', 'url'];
const EXECUTION_OPERATIONS: ExecutionProfileOperation[] = [
  'text_to_image',
  'image_to_image',
  'image_edit',
  'conversational_image',
];
const SOURCE_KINDS: ExecutionProfileSourceKind[] = [
  'manual',
  'openai_official',
  'gemini_official',
  'third_party_docs',
  'imported_json',
];
type StudioQuickParameterKind = 'count' | 'ratio' | 'resolution';

interface StudioQuickParameterConfig {
  defaultField: ParameterSchemaField;
  description: string;
  kind: StudioQuickParameterKind;
  slot: 'count' | 'aspect_ratio' | 'resolution';
  title: string;
}

const STUDIO_QUICK_PARAMETER_CONFIGS: StudioQuickParameterConfig[] = [
  {
    defaultField: {
      capability: 'count',
      default: 1,
      key: 'n',
      label: '张数',
      max: 4,
      min: 1,
      placeholder: '1',
      required: false,
      send_policy: 'when_present',
      type: 'integer',
      ui: {
        group: 'quick',
        order: 10,
        slot: 'count',
      },
      validation: {
        max: 4,
        min: 1,
      },
    },
    description: '控制一次任务生成的图片数量。',
    kind: 'count',
    slot: 'count',
    title: '张数',
  },
  {
    defaultField: {
      capability: 'aspect_ratio',
      default: '1:1',
      key: 'aspect_ratio',
      label: '比例',
      options: [
        { label: '1:1', value: '1:1' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
      ],
      required: false,
      send_policy: 'when_present',
      type: 'select',
      ui: {
        group: 'quick',
        order: 20,
        slot: 'aspect_ratio',
      },
      validation: {
        enum: ['1:1', '16:9', '9:16'],
      },
    },
    description: '画幅比例，选项会显示在 Studio 的比例选择里。',
    kind: 'ratio',
    slot: 'aspect_ratio',
    title: '比例',
  },
  {
    defaultField: {
      capability: 'resolution',
      default: '1024x1024',
      key: 'size',
      label: '分辨率',
      options: [
        { label: '1024x1024', value: '1024x1024' },
        { label: '1536x1024', value: '1536x1024' },
        { label: '1024x1536', value: '1024x1536' },
      ],
      required: false,
      send_policy: 'when_present',
      type: 'select',
      ui: {
        group: 'quick',
        order: 30,
        slot: 'resolution',
      },
      validation: {
        enum: ['1024x1024', '1536x1024', '1024x1536'],
      },
    },
    description: '像素规格，选项会显示在 Studio 的分辨率选择里。',
    kind: 'resolution',
    slot: 'resolution',
    title: '分辨率',
  },
];

export function ParameterSchemaForm({
  schema,
  value,
  onChange,
}: {
  schema: ParameterSchemaField[];
  value: Record<string, string | number | boolean | null>;
  onChange: (value: Record<string, string | number | boolean | null>) => void;
}) {
  const mergedValue = useMemo(() => {
    const next: Record<string, string | number | boolean | null> = {};
    for (const field of schema) {
      if (Object.prototype.hasOwnProperty.call(value, field.key)) {
        next[field.key] = value[field.key];
      } else if (field.default !== undefined) {
        next[field.key] = field.default;
      } else {
        next[field.key] = field.type === 'boolean' ? false : '';
      }
    }
    return next;
  }, [schema, value]);

  useEffect(() => {
    if (!areParameterValuesEqual(value, mergedValue)) {
      onChange(mergedValue);
    }
  }, [mergedValue, onChange, value]);

  if (schema.length === 0) {
    return (
      <p className="ds-muted rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-muted)] p-4 text-sm">
        该模型暂无可配置参数。
      </p>
    );
  }

  function updateField(key: string, nextValue: string | number | boolean | null) {
    onChange({
      ...mergedValue,
      [key]: nextValue,
    });
  }

  return (
    <div className="grid gap-4">
      {schema.map((field) => (
        <div className="grid gap-2" key={field.key}>
          <label className="text-sm font-black" htmlFor={`parameter-${field.key}`}>
            {field.label}
            {field.required ? <span className="text-[var(--ds-danger)]"> *</span> : null}
          </label>
          {field.description ? <p className="ds-muted text-xs">{field.description}</p> : null}
          {renderParameterInput(field, mergedValue[field.key], updateField)}
        </div>
      ))}
    </div>
  );
}

export function SchemaBuilder({
  schema,
  onChange,
}: {
  schema: ParameterSchemaField[];
  onChange: (schema: ParameterSchemaField[]) => void;
}) {
  function updateField(index: number, field: ParameterSchemaField) {
    onChange(schema.map((item, itemIndex) => (itemIndex === index ? field : item)));
  }

  function removeField(index: number) {
    onChange(schema.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-black">参数 Schema</h3>
        <DsButton
          onClick={() => onChange([...schema, emptySchemaField()])}
          type="button"
          variant="secondary"
        >
          新增参数
        </DsButton>
      </div>
      {schema.length === 0 ? (
        <p className="ds-muted rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-muted)] p-4 text-sm">
          暂无参数字段。
        </p>
      ) : (
        schema.map((field, index) => (
          <SchemaFieldEditor
            field={field}
            key={`${field.key}-${index}`}
            onChange={(nextField) => updateField(index, nextField)}
            onRemove={() => removeField(index)}
          />
        ))
      )}
    </div>
  );
}

export function SchemaFieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: ParameterSchemaField;
  onChange: (field: ParameterSchemaField) => void;
  onRemove: () => void;
}) {
  function patchField(patch: Partial<ParameterSchemaField>) {
    onChange({
      ...field,
      ...patch,
    });
  }

  function patchUi(patch: NonNullable<ParameterSchemaField['ui']>) {
    const nextUi = {
      ...(field.ui ?? {}),
      ...patch,
    };
    patchField({
      ui: Object.values(nextUi).some((value) => value !== undefined && value !== '')
        ? nextUi
        : undefined,
    });
  }

  function updateValidation(rawValue: string) {
    if (!rawValue.trim()) {
      patchField({ validation: undefined });
      return;
    }
    patchField({ validation: parseJsonObject(rawValue) });
  }

  function updateDefault(rawValue: string) {
    if (rawValue === '') {
      const { default: _default, ...rest } = field;
      onChange(rest);
      return;
    }

    if (field.type === 'number' || field.type === 'integer') {
      patchField({ default: Number(rawValue) });
      return;
    }

    if (field.type === 'boolean') {
      patchField({ default: rawValue === 'true' });
      return;
    }

    patchField({ default: rawValue });
  }

  function updateOptions(rawValue: string) {
    patchField({
      options: rawValue
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [label, value] = line.includes('|') ? line.split('|', 2) : [line, line];
          return {
            label: label.trim(),
            value: value.trim(),
          };
        }),
    });
  }

  return (
    <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <DsInput
          label="key"
          onChange={(event) => patchField({ key: event.target.value })}
          value={field.key}
        />
        <DsInput
          label="label"
          onChange={(event) => patchField({ label: event.target.value })}
          value={field.label}
        />
        <label className="grid gap-2 text-sm font-bold">
          <span>type</span>
          <select
            className="ds-input"
            onChange={(event) =>
              patchField({
                type: event.target.value as ParameterFieldType,
                options: event.target.value === 'select' ? (field.options ?? []) : undefined,
              })
            }
            value={field.type}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <DsInput
          label="placeholder"
          onChange={(event) => patchField({ placeholder: event.target.value || undefined })}
          value={field.placeholder ?? ''}
        />
        <DsInput
          label="min"
          onChange={(event) =>
            patchField({ min: event.target.value === '' ? undefined : Number(event.target.value) })
          }
          type="number"
          value={field.min ?? ''}
        />
        <DsInput
          label="max"
          onChange={(event) =>
            patchField({ max: event.target.value === '' ? undefined : Number(event.target.value) })
          }
          type="number"
          value={field.max ?? ''}
        />
      </div>

      <label className="mt-3 grid gap-2 text-sm font-bold">
        <span>description</span>
        <textarea
          className="ds-input min-h-20 py-3"
          onChange={(event) => patchField({ description: event.target.value || undefined })}
          value={field.description ?? ''}
        />
      </label>

      {field.type === 'select' ? (
        <label className="mt-3 grid gap-2 text-sm font-bold">
          <span>options</span>
          <textarea
            className="ds-input min-h-24 py-3"
            onChange={(event) => updateOptions(event.target.value)}
            value={(field.options ?? [])
              .map((option) => `${option.label}|${option.value}`)
              .join('\n')}
          />
        </label>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-bold">
          <span>ui.group</span>
          <select
            className="ds-input"
            onChange={(event) => patchUi({ group: event.target.value || undefined })}
            value={field.ui?.group ?? ''}
          >
            <option value="">未设置</option>
            {UI_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          <span>ui.slot</span>
          <select
            className="ds-input"
            onChange={(event) => patchUi({ slot: event.target.value || undefined })}
            value={field.ui?.slot ?? ''}
          >
            <option value="">未设置</option>
            {UI_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </label>
        <DsInput
          label="ui.order"
          onChange={(event) =>
            patchUi({ order: event.target.value === '' ? undefined : Number(event.target.value) })
          }
          type="number"
          value={field.ui?.order ?? ''}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <DsInput
          label="capability"
          onChange={(event) => patchField({ capability: event.target.value || undefined })}
          value={field.capability ?? ''}
        />
        <label className="grid gap-2 text-sm font-bold">
          <span>send_policy</span>
          <select
            className="ds-input"
            onChange={(event) => patchField({ send_policy: event.target.value || undefined })}
            value={field.send_policy ?? ''}
          >
            <option value="">未设置</option>
            {SEND_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {policy}
              </option>
            ))}
          </select>
        </label>
        <DsInput
          label="help_url"
          onChange={(event) => patchField({ help_url: event.target.value || undefined })}
          value={field.help_url ?? ''}
        />
      </div>

      <label className="mt-3 grid gap-2 text-sm font-bold">
        <span>validation JSON</span>
        <textarea
          className="ds-input min-h-24 py-3 font-mono text-xs"
          onChange={(event) => updateValidation(event.target.value)}
          value={field.validation ? JSON.stringify(field.validation, null, 2) : ''}
        />
      </label>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <DsInput
          label="default"
          onChange={(event) => updateDefault(event.target.value)}
          value={field.default === undefined || field.default === null ? '' : String(field.default)}
        />
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-black">
          <input
            checked={field.required}
            onChange={(event) => patchField({ required: event.target.checked })}
            type="checkbox"
          />
          必填
        </label>
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-black">
          <input
            checked={field.deprecated === true}
            onChange={(event) => patchField({ deprecated: event.target.checked || undefined })}
            type="checkbox"
          />
          已弃用
        </label>
        <DsButton onClick={onRemove} type="button" variant="danger">
          删除
        </DsButton>
      </div>
    </div>
  );
}

export function SchemaPreview({ schema }: { schema: ParameterSchemaField[] }) {
  return (
    <div className="grid gap-3">
      <h3 className="text-lg font-black">JSON 预览</h3>
      <pre className="max-h-80 overflow-auto rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 text-xs">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </div>
  );
}

export function StudioQuickParameterSettings({
  schema,
  onChange,
}: {
  schema: ParameterSchemaField[];
  onChange: (schema: ParameterSchemaField[]) => void;
}) {
  return (
    <section className="grid gap-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4">
      <div className="grid gap-1">
        <h3 className="text-lg font-black">Studio 快捷参数</h3>
        <p className="ds-muted text-sm leading-6">
          这里配置的字段会显示在 /studio 输入区下方；关闭某项会从参数 Schema 中移除对应字段。
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {STUDIO_QUICK_PARAMETER_CONFIGS.map((config) => (
          <StudioQuickParameterCard
            config={config}
            key={config.kind}
            onChange={onChange}
            schema={schema}
          />
        ))}
      </div>
    </section>
  );
}

function StudioQuickParameterCard({
  config,
  schema,
  onChange,
}: {
  config: StudioQuickParameterConfig;
  schema: ParameterSchemaField[];
  onChange: (schema: ParameterSchemaField[]) => void;
}) {
  const field = findStudioQuickParameterField(schema, config);
  const enabled = Boolean(field);
  const effectiveField = field ?? config.defaultField;

  function toggleEnabled(checked: boolean) {
    onChange(
      checked
        ? upsertStudioQuickParameterField(schema, config, config.defaultField)
        : removeStudioQuickParameterField(schema, config),
    );
  }

  function patchField(patch: Partial<ParameterSchemaField>) {
    onChange(
      upsertStudioQuickParameterField(schema, config, {
        ...effectiveField,
        ...patch,
      }),
    );
  }

  return (
    <div
      className={`grid gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 ${
        enabled ? '' : 'opacity-70'
      }`}
    >
      <label className="flex items-start justify-between gap-3 text-sm font-black">
        <span className="grid gap-1">
          <span>{config.title}</span>
          <code className="text-xs font-semibold text-[var(--ds-muted)]">
            key: {effectiveField.key}
          </code>
        </span>
        <input
          checked={enabled}
          onChange={(event) => toggleEnabled(event.target.checked)}
          type="checkbox"
        />
      </label>
      <p className="ds-muted text-xs leading-5">{config.description}</p>
      {enabled ? (
        <>
          <DsInput
            label="参数 key"
            onChange={(event) => patchField({ key: event.target.value })}
            value={effectiveField.key}
          />
          {renderStudioQuickParameterControls(config, effectiveField, patchField)}
        </>
      ) : null}
    </div>
  );
}

export function ModelForm({
  csrfToken,
  initialModel,
  onSubmit,
  submitting,
}: {
  csrfToken: string | null;
  initialModel?: AdminAiModel | null;
  onSubmit: (payload: AiModelPayload) => Promise<void>;
  submitting: boolean;
}) {
  const [form, setForm] = useState<AiModelPayload>(() => ({
    modality: initialModel?.modality ?? 'image',
    model_id: initialModel?.model_id ?? '',
    display_name: initialModel?.display_name ?? '',
    provider_name: initialModel?.provider_name ?? '',
    icon_url: initialModel?.icon_url ?? null,
    description: initialModel?.description ?? '',
    endpoint_types: initialModel?.endpoint_types ?? ['openai_image_generations'],
    reference_transfer_mode: initialModel?.reference_transfer_mode ?? 'none',
    supports_reference_image: initialModel?.supports_reference_image ?? false,
    is_enabled: initialModel?.is_enabled ?? true,
    is_recommended: initialModel?.is_recommended ?? false,
    sort_order: initialModel?.sort_order ?? 0,
    default_params: initialModel?.default_params ?? {},
    parameter_schema: initialModel?.parameter_schema ?? [],
  }));
  const [defaultParamsJson, setDefaultParamsJson] = useState(() =>
    JSON.stringify(initialModel?.default_params ?? {}, null, 2),
  );
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);

  function patchForm(patch: Partial<AiModelPayload>) {
    setForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  function toggleEndpointType(type: ModelEndpointType) {
    setForm((current) => {
      const enabled = current.endpoint_types.includes(type);
      const nextEndpointTypes = enabled
        ? current.endpoint_types.filter((item) => item !== type)
        : [...current.endpoint_types, type];

      return {
        ...current,
        endpoint_types: nextEndpointTypes.length > 0 ? nextEndpointTypes : current.endpoint_types,
      };
    });
  }

  async function uploadIcon(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!csrfToken) {
      setIconError('登录状态已失效，请重新登录');
      return;
    }

    setUploadingIcon(true);
    setIconError(null);
    try {
      const uploaded = await uploadModelIcon(file, csrfToken);
      patchForm({ icon_url: uploaded.url });
    } catch (error) {
      setIconError(error instanceof Error ? error.message : '上传图标失败');
    } finally {
      setUploadingIcon(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedDefaultParams = parseJsonObject(defaultParamsJson);
    await onSubmit({
      ...form,
      model_id: form.model_id.trim(),
      display_name: form.display_name.trim(),
      provider_name: form.provider_name?.trim() || null,
      icon_url: form.icon_url?.trim() || null,
      description: form.description?.trim() || null,
      default_params: parsedDefaultParams,
    });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <DsInput
          label="模型 ID"
          onChange={(event) => patchForm({ model_id: event.target.value })}
          required
          value={form.model_id}
        />
        <DsInput
          label="展示名称"
          onChange={(event) => patchForm({ display_name: event.target.value })}
          required
          value={form.display_name}
        />
        <DsInput
          label="厂商"
          onChange={(event) => patchForm({ provider_name: event.target.value || null })}
          value={form.provider_name ?? ''}
        />
        <label className="grid gap-2 text-sm font-bold">
          <span>模型类型</span>
          <select
            className="ds-input"
            onChange={(event) => patchForm({ modality: event.target.value as ModelModality })}
            value={form.modality}
          >
            {MODEL_MODALITIES.map((modality) => (
              <option key={modality} value={modality}>
                {modalityLabel(modality)}
              </option>
            ))}
          </select>
        </label>
        <DsInput
          label="排序"
          onChange={(event) => patchForm({ sort_order: Number(event.target.value) })}
          type="number"
          value={form.sort_order}
        />
        <label className="grid gap-2 text-sm font-bold">
          <span>参考图传递</span>
          <select
            className="ds-input"
            onChange={(event) =>
              patchForm({ reference_transfer_mode: event.target.value as ReferenceTransferMode })
            }
            value={form.reference_transfer_mode}
          >
            {TRANSFER_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {transferModeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[84px_1fr]">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] text-2xl font-black">
          {form.icon_url ? (
            <img
              alt={form.display_name || '模型图标'}
              className="h-full w-full object-cover"
              src={form.icon_url}
            />
          ) : (
            form.display_name.slice(0, 1) || 'M'
          )}
        </div>
        <div className="grid gap-3">
          <DsInput
            label="图标 URL"
            onChange={(event) => patchForm({ icon_url: event.target.value || null })}
            value={form.icon_url ?? ''}
          />
          <label className="flex w-fit cursor-pointer items-center justify-center rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-black">
            {uploadingIcon ? '上传中...' : '上传图标'}
            <input
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="sr-only"
              disabled={uploadingIcon}
              onChange={uploadIcon}
              type="file"
            />
          </label>
          {iconError ? (
            <p className="text-sm font-semibold text-[var(--ds-danger)]">{iconError}</p>
          ) : null}
        </div>
      </div>

      <label className="grid gap-2 text-sm font-bold">
        <span>模型描述</span>
        <textarea
          className="ds-input min-h-28 py-3"
          onChange={(event) => patchForm({ description: event.target.value || null })}
          value={form.description ?? ''}
        />
      </label>

      <fieldset className="grid gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4">
        <legend className="px-1 text-sm font-black">端点类型</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {ENDPOINT_TYPES.map((type) => (
            <label
              className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 font-bold"
              key={type}
            >
              <input
                checked={form.endpoint_types.includes(type)}
                onChange={() => toggleEndpointType(type)}
                type="checkbox"
              />
              {endpointTypeLabel(type)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 font-bold">
          <input
            checked={form.supports_reference_image}
            onChange={(event) => patchForm({ supports_reference_image: event.target.checked })}
            type="checkbox"
          />
          支持参考图
        </label>
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 font-bold">
          <input
            checked={form.is_enabled}
            onChange={(event) => patchForm({ is_enabled: event.target.checked })}
            type="checkbox"
          />
          启用
        </label>
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 font-bold">
          <input
            checked={form.is_recommended}
            onChange={(event) => patchForm({ is_recommended: event.target.checked })}
            type="checkbox"
          />
          推荐
        </label>
      </div>

      <label className="grid gap-2 text-sm font-bold">
        <span>默认参数 JSON</span>
        <textarea
          className="ds-input min-h-28 py-3 font-mono text-xs"
          onChange={(event) => setDefaultParamsJson(event.target.value)}
          value={defaultParamsJson}
        />
      </label>

      <StudioQuickParameterSettings
        onChange={(parameterSchema) => patchForm({ parameter_schema: parameterSchema })}
        schema={form.parameter_schema}
      />

      <SchemaBuilder
        onChange={(parameterSchema) => patchForm({ parameter_schema: parameterSchema })}
        schema={form.parameter_schema}
      />
      <SchemaPreview schema={form.parameter_schema} />

      <DsButton className="w-fit" disabled={submitting} type="submit">
        {submitting ? '保存中...' : initialModel ? '保存模型' : '创建模型'}
      </DsButton>
    </form>
  );
}

export function ExecutionProfileManager({
  csrfToken,
  model,
  onChanged,
}: {
  csrfToken: string | null;
  model: AdminAiModel;
  onChanged: () => Promise<void>;
}) {
  const [profiles, setProfiles] = useState<AdminExecutionProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ExecutionProfilePayload | null>(null);
  const [revisionDraft, setRevisionDraft] = useState<ExecutionProfileRevisionPayload | null>(null);
  const [templates, setTemplates] = useState<ProfileTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateImportMode, setTemplateImportMode] =
    useState<ProfileTemplateImportMode>('template');
  const [templateUpstreamModelId, setTemplateUpstreamModelId] = useState(model.model_id);
  const [revisionDiff, setRevisionDiff] = useState<ExecutionProfileRevisionDiffResult | null>(null);
  const [preview, setPreview] = useState<ExecutionProfilePreviewResult | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedRevision =
    selectedProfile?.revisions?.find((revision) => revision.id === selectedRevisionId) ?? null;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  useEffect(() => {
    void loadProfiles();
    void loadTemplates();
  }, [model.id]);

  useEffect(() => {
    if (
      templateImportMode === 'openai_compatible_copy' &&
      !selectedTemplate?.compatible_copy_allowed
    ) {
      setTemplateImportMode('template');
    }
  }, [selectedTemplate, templateImportMode]);

  async function loadProfiles(preferredProfileId = selectedProfileId) {
    setLoadingProfiles(true);
    setProfileError(null);
    try {
      const response = await fetchExecutionProfiles(model.id);
      setProfiles(response.items);
      const nextProfile =
        response.items.find((profile) => profile.id === preferredProfileId) ??
        response.items.find((profile) => profile.is_default) ??
        response.items[0] ??
        null;
      setSelectedProfileId(nextProfile?.id ?? null);
      const nextRevision =
        nextProfile?.revisions?.find((revision) => revision.status === 'draft') ??
        nextProfile?.revisions?.find((revision) => revision.status === 'active') ??
        nextProfile?.revisions?.[0] ??
        null;
      setSelectedRevisionId(nextRevision?.id ?? null);
      setProfileDraft(nextProfile ? profileToPayload(nextProfile) : emptyProfilePayload(model));
      setRevisionDraft(nextRevision ? revisionToPayload(nextRevision) : null);
      setTemplateUpstreamModelId(nextProfile?.upstream_model_id ?? model.model_id);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '读取执行配置失败');
    } finally {
      setLoadingProfiles(false);
    }
  }

  function selectProfile(profile: AdminExecutionProfile) {
    setSelectedProfileId(profile.id);
    const revision =
      profile.revisions?.find((item) => item.status === 'draft') ??
      profile.revisions?.find((item) => item.status === 'active') ??
      profile.revisions?.[0] ??
      null;
    setSelectedRevisionId(revision?.id ?? null);
    setProfileDraft(profileToPayload(profile));
    setRevisionDraft(revision ? revisionToPayload(revision) : null);
    setPreview(null);
    setRevisionDiff(null);
    setTemplateUpstreamModelId(profile.upstream_model_id);
  }

  function selectRevision(revision: AdminExecutionProfileRevision) {
    setSelectedRevisionId(revision.id);
    setRevisionDraft(revisionToPayload(revision));
    setPreview(null);
    setRevisionDiff(null);
  }

  async function loadTemplates() {
    try {
      const response = await fetchProfileTemplates();
      setTemplates(response.items);
      setSelectedTemplateId((current) => current || response.items[0]?.id || '');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '读取 Profile 模板失败');
    }
  }

  async function withProfileAction(action: () => Promise<void>, success: string) {
    if (!csrfToken) {
      setProfileError('登录状态已失效，请重新登录');
      return;
    }
    setSavingProfile(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      await action();
      setProfileMessage(success);
      await onChanged();
      await loadProfiles(selectedProfileId);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '执行配置操作失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveProfile() {
    if (!profileDraft) {
      return;
    }
    await withProfileAction(async () => {
      if (selectedProfile) {
        await updateExecutionProfile(selectedProfile.id, profileDraft, csrfToken!);
      } else {
        await createExecutionProfile(model.id, profileDraft, csrfToken!);
      }
    }, '执行配置已保存。');
  }

  async function createDraftRevision() {
    if (!selectedProfile) {
      return;
    }
    await withProfileAction(async () => {
      const created = await createExecutionProfileRevision(
        selectedProfile.id,
        revisionDraft ?? {},
        csrfToken!,
      );
      setSelectedRevisionId(created.item.id);
    }, 'Draft revision 已创建。');
  }

  async function importSelectedTemplate() {
    if (!selectedProfile || !selectedTemplateId) {
      setProfileError('请选择 Profile 和模板');
      return;
    }
    await withProfileAction(async () => {
      const created = await importProfileTemplateRevision(
        selectedProfile.id,
        selectedTemplateId,
        {
          mode: templateImportMode,
          upstream_model_id: templateUpstreamModelId.trim() || undefined,
        },
        csrfToken!,
      );
      setSelectedRevisionId(created.item.id);
      setRevisionDraft(revisionToPayload(created.item));
      setRevisionDiff(null);
    }, '模板已导入为 Draft revision。');
  }

  async function saveRevision() {
    if (!selectedRevision || !revisionDraft) {
      return;
    }
    await withProfileAction(async () => {
      await updateExecutionProfileRevision(selectedRevision.id, revisionDraft, csrfToken!);
    }, 'Revision 已保存。');
  }

  async function runRevisionAction(kind: 'lint' | 'preview' | 'test' | 'activate') {
    if (!selectedRevision || !csrfToken) {
      setProfileError('请选择 revision');
      return;
    }
    setSavingProfile(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      if (kind === 'lint') {
        const result = await lintExecutionProfileRevision(selectedRevision.id, csrfToken);
        setProfileMessage(result.result.ok ? 'Lint 通过。' : 'Lint 存在错误。');
      } else if (kind === 'preview') {
        const result = await previewExecutionProfileRevision(
          selectedRevision.id,
          { parameters: revisionDraft?.default_params ?? {} },
          csrfToken,
        );
        setPreview(result.preview);
        setProfileMessage('请求预览已生成。');
      } else if (kind === 'test') {
        const result = await testExecutionProfileRevision(selectedRevision.id, csrfToken);
        setProfileMessage(
          result.result.message ?? (result.result.ok ? '测试通过。' : '测试失败。'),
        );
      } else {
        await activateExecutionProfileRevision(selectedRevision.id, csrfToken);
        setProfileMessage('Revision 已发布。');
        await onChanged();
        await loadProfiles(selectedProfileId);
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Revision 操作失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function loadRevisionDiff() {
    if (!selectedRevision) {
      setProfileError('请选择 revision');
      return;
    }
    setSavingProfile(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      const result = await diffExecutionProfileRevision(selectedRevision.id);
      setRevisionDiff(result.diff);
      setProfileMessage('Diff 已生成。');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Diff 生成失败');
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">执行配置</h3>
          <p className="ds-muted mt-1 text-sm">Profile 和 revision 发布后才会影响用户侧 Studio。</p>
        </div>
        <DsButton onClick={() => void loadProfiles()} type="button" variant="secondary">
          刷新配置
        </DsButton>
      </div>

      {profileMessage ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
          {profileMessage}
        </p>
      ) : null}
      {profileError ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {profileError}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="grid content-start gap-2">
          {loadingProfiles ? <p className="ds-muted text-sm font-semibold">正在读取...</p> : null}
          {profiles.map((profile) => (
            <button
              className={`rounded-[var(--ds-radius-sm)] border p-3 text-left text-sm ${
                profile.id === selectedProfileId
                  ? 'border-[var(--ds-accent)] bg-[var(--ds-surface-raised)]'
                  : 'border-[var(--ds-border)] bg-[var(--ds-surface)]'
              }`}
              key={profile.id}
              onClick={() => selectProfile(profile)}
              type="button"
            >
              <strong>{profile.name}</strong>
              <span className="ds-muted mt-1 block break-all text-xs">{profile.adapter_key}</span>
              <span className="mt-2 flex flex-wrap gap-1 text-xs font-black">
                {profile.is_default ? <span>默认</span> : null}
                {profile.is_enabled ? <span>启用</span> : <span>禁用</span>}
                <span>{profile.revisions?.length ?? 0} rev</span>
              </span>
            </button>
          ))}
          <DsButton
            onClick={() => {
              setSelectedProfileId(null);
              setSelectedRevisionId(null);
              setProfileDraft(emptyProfilePayload(model));
              setRevisionDraft(null);
              setPreview(null);
            }}
            type="button"
            variant="secondary"
          >
            新建 Profile
          </DsButton>
        </div>

        <div className="grid gap-4">
          {profileDraft ? (
            <div className="grid gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4">
              <h4 className="font-black">Profile</h4>
              <div className="grid gap-3 md:grid-cols-3">
                <DsInput
                  label="名称"
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...(current ?? {}), name: event.target.value }))
                  }
                  value={profileDraft.name ?? ''}
                />
                <label className="grid gap-2 text-sm font-bold">
                  <span>operation</span>
                  <select
                    className="ds-input"
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...(current ?? {}),
                        operation: event.target.value as ExecutionProfileOperation,
                      }))
                    }
                    value={profileDraft.operation ?? 'text_to_image'}
                  >
                    {EXECUTION_OPERATIONS.map((operation) => (
                      <option key={operation} value={operation}>
                        {operation}
                      </option>
                    ))}
                  </select>
                </label>
                <DsInput
                  label="adapter_key"
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...(current ?? {}),
                      adapter_key: event.target.value,
                    }))
                  }
                  value={profileDraft.adapter_key ?? ''}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <DsInput
                  label="upstream_model_id"
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...(current ?? {}),
                      upstream_model_id: event.target.value,
                    }))
                  }
                  value={profileDraft.upstream_model_id ?? ''}
                />
                <DsInput
                  label="endpoint_path"
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...(current ?? {}),
                      upstream_endpoint_path: event.target.value || null,
                    }))
                  }
                  value={profileDraft.upstream_endpoint_path ?? ''}
                />
                <DsInput
                  label="sort_order"
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...(current ?? {}),
                      sort_order: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={profileDraft.sort_order ?? 0}
                />
                <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3 text-sm font-black">
                  <input
                    checked={profileDraft.is_default === true}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...(current ?? {}),
                        is_default: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  默认
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <DsButton disabled={savingProfile} onClick={saveProfile} type="button">
                  保存 Profile
                </DsButton>
                {selectedProfile ? (
                  <DsButton disabled={savingProfile} onClick={createDraftRevision} type="button">
                    新建 Draft Revision
                  </DsButton>
                ) : null}
              </div>
            </div>
          ) : null}

          {selectedProfile ? (
            <div className="grid gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4">
              <h4 className="font-black">模板导入</h4>
              <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_1fr]">
                <label className="grid gap-2 text-sm font-bold">
                  <span>Profile template</span>
                  <select
                    className="ds-input"
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    value={selectedTemplateId}
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  <span>导入模式</span>
                  <select
                    className="ds-input"
                    onChange={(event) =>
                      setTemplateImportMode(event.target.value as ProfileTemplateImportMode)
                    }
                    value={templateImportMode}
                  >
                    <option value="template">按模板来源导入</option>
                    <option
                      disabled={!selectedTemplate?.compatible_copy_allowed}
                      value="openai_compatible_copy"
                    >
                      复制为 compatible 草稿
                    </option>
                  </select>
                </label>
                <DsInput
                  label="upstream_model_id"
                  onChange={(event) => setTemplateUpstreamModelId(event.target.value)}
                  value={templateUpstreamModelId}
                />
              </div>
              {selectedTemplate ? (
                <div className="grid gap-2 text-sm">
                  <p className="ds-muted font-semibold">{selectedTemplate.description}</p>
                  <p className="break-all font-semibold">
                    {selectedTemplate.adapter_key} · {selectedTemplate.source_url ?? 'no source'}
                  </p>
                  <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-warning)]/30 bg-[var(--ds-surface)] px-3 py-2 text-xs font-semibold text-[var(--ds-warning)]">
                    {selectedTemplate.compatible_warning}
                  </p>
                </div>
              ) : null}
              <DsButton
                className="w-fit"
                disabled={savingProfile || !selectedTemplateId}
                onClick={importSelectedTemplate}
                type="button"
                variant="secondary"
              >
                从模板导入 Draft
              </DsButton>
            </div>
          ) : null}

          {selectedProfile?.revisions?.length ? (
            <div className="flex flex-wrap gap-2">
              {selectedProfile.revisions.map((revision) => (
                <button
                  className={`rounded-[var(--ds-radius-sm)] border px-3 py-2 text-sm font-black ${
                    revision.id === selectedRevisionId
                      ? 'border-[var(--ds-accent)] bg-[var(--ds-surface-raised)]'
                      : 'border-[var(--ds-border)] bg-[var(--ds-surface)]'
                  }`}
                  key={revision.id}
                  onClick={() => selectRevision(revision)}
                  type="button"
                >
                  r{revision.revision_no} / {revision.status}
                </button>
              ))}
            </div>
          ) : null}

          {selectedRevision && revisionDraft ? (
            <RevisionEditor
              disabled={savingProfile}
              draft={revisionDraft}
              onDiff={loadRevisionDiff}
              onAction={runRevisionAction}
              onChange={setRevisionDraft}
              onSave={saveRevision}
              preview={preview}
              revisionDiff={revisionDiff}
              revision={selectedRevision}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
export function ModelSyncSnapshotPanel({
  snapshots,
  selectedSnapshot,
  onCreate,
  onSelect,
  creating,
}: {
  snapshots: ModelSyncSnapshotSummary[];
  selectedSnapshot: ModelSyncSnapshotDetail | null;
  onCreate: (payload: ModelSyncSnapshotPayload) => Promise<void>;
  onSelect: (snapshotId: string) => Promise<void>;
  creating: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  async function createWithTemporaryKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate({
      ...(baseUrl.trim() ? { new_api_base_url: baseUrl.trim() } : {}),
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
    });
    setApiKey('');
  }

  return (
    <div className="grid gap-5">
      <form className="grid gap-4" onSubmit={createWithTemporaryKey}>
        <div className="grid gap-4 md:grid-cols-2">
          <DsInput
            label="临时 Base URL"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://new-api.example.com"
            value={baseUrl}
          />
          <DsInput
            label="临时 API Key"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="留空则使用当前管理员已保存配置"
            type="password"
            value={apiKey}
          />
        </div>
        <DsButton className="w-fit" disabled={creating} type="submit">
          {creating ? '拉取中...' : '拉取模型候选'}
        </DsButton>
      </form>

      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        <div className="grid max-h-[540px] gap-2 overflow-auto">
          {snapshots.map((snapshot) => (
            <button
              className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-3 text-left text-sm"
              key={snapshot.id}
              onClick={() => onSelect(snapshot.id)}
              type="button"
            >
              <strong>{snapshot.model_count} 个候选</strong>
              <span className="ds-muted mt-1 block break-all text-xs">{snapshot.base_url}</span>
              <span className="ds-muted mt-1 block text-xs">
                {new Intl.DateTimeFormat('zh-CN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(snapshot.created_at))}
              </span>
            </button>
          ))}
        </div>
        <pre className="min-h-80 overflow-auto rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 text-xs">
          {selectedSnapshot
            ? JSON.stringify(selectedSnapshot.raw_response, null, 2)
            : '选择一个快照查看 raw_response'}
        </pre>
      </div>
    </div>
  );
}

function RevisionEditor({
  disabled,
  draft,
  onDiff,
  onAction,
  onChange,
  onSave,
  preview,
  revisionDiff,
  revision,
}: {
  disabled: boolean;
  draft: ExecutionProfileRevisionPayload;
  onDiff: () => Promise<void>;
  onAction: (kind: 'lint' | 'preview' | 'test' | 'activate') => Promise<void>;
  onChange: (draft: ExecutionProfileRevisionPayload) => void;
  onSave: () => Promise<void>;
  preview: ExecutionProfilePreviewResult | null;
  revisionDiff: ExecutionProfileRevisionDiffResult | null;
  revision: AdminExecutionProfileRevision;
}) {
  function patch(patchDraft: Partial<ExecutionProfileRevisionPayload>) {
    onChange({
      ...draft,
      ...patchDraft,
    });
  }

  return (
    <div className="grid gap-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-black">
          Revision r{revision.revision_no} / {revision.status}
        </h4>
        <div className="flex flex-wrap gap-2">
          <DsButton
            disabled={disabled || revision.status !== 'draft'}
            onClick={onSave}
            type="button"
          >
            保存 Draft
          </DsButton>
          <DsButton
            disabled={disabled}
            onClick={() => void onAction('lint')}
            type="button"
            variant="secondary"
          >
            Lint
          </DsButton>
          <DsButton
            disabled={disabled}
            onClick={() => void onAction('preview')}
            type="button"
            variant="secondary"
          >
            预览请求
          </DsButton>
          <DsButton
            disabled={disabled}
            onClick={() => void onDiff()}
            type="button"
            variant="secondary"
          >
            Diff
          </DsButton>
          <DsButton
            disabled={disabled}
            onClick={() => void onAction('test')}
            type="button"
            variant="secondary"
          >
            Test
          </DsButton>
          <DsButton disabled={disabled} onClick={() => void onAction('activate')} type="button">
            发布
          </DsButton>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-2 text-sm font-bold">
          <span>source_kind</span>
          <select
            className="ds-input"
            disabled={revision.status !== 'draft'}
            onChange={(event) =>
              patch({ source_kind: event.target.value as ExecutionProfileSourceKind })
            }
            value={draft.source_kind ?? 'manual'}
          >
            {SOURCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <DsInput
          disabled={revision.status !== 'draft'}
          label="adapter_key"
          onChange={(event) => patch({ adapter_key: event.target.value })}
          value={draft.adapter_key ?? ''}
        />
        <DsInput
          disabled={revision.status !== 'draft'}
          label="upstream_model_id"
          onChange={(event) => patch({ upstream_model_id: event.target.value })}
          value={draft.upstream_model_id ?? ''}
        />
        <DsInput
          disabled={revision.status !== 'draft'}
          label="endpoint_path"
          onChange={(event) => patch({ upstream_endpoint_path: event.target.value || null })}
          value={draft.upstream_endpoint_path ?? ''}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <DsInput
          disabled={revision.status !== 'draft'}
          label="source_url"
          onChange={(event) => patch({ source_url: event.target.value || null })}
          value={draft.source_url ?? ''}
        />
        <DsInput
          disabled={revision.status !== 'draft'}
          label="source_checked_at"
          onChange={(event) => patch({ source_checked_at: event.target.value || null })}
          type="datetime-local"
          value={formatDateTimeLocal(draft.source_checked_at)}
        />
        <DsInput
          disabled={revision.status !== 'draft'}
          label="response_parser_key"
          onChange={(event) => patch({ response_parser_key: event.target.value })}
          value={draft.response_parser_key ?? ''}
        />
      </div>

      <SchemaBuilder
        onChange={(parameterSchema) => patch({ parameter_schema: parameterSchema })}
        schema={draft.parameter_schema ?? []}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <JsonEditor
          disabled={revision.status !== 'draft'}
          label="default_params"
          onChange={(value) => patch({ default_params: value })}
          value={draft.default_params ?? {}}
        />
        <JsonEditor
          disabled={revision.status !== 'draft'}
          label="request_mapping"
          onChange={(value) => patch({ request_mapping: value })}
          value={draft.request_mapping ?? {}}
        />
        <JsonEditor
          disabled={revision.status !== 'draft'}
          label="capabilities"
          onChange={(value) => patch({ capabilities: value })}
          value={draft.capabilities ?? {}}
        />
        <JsonEditor
          disabled={revision.status !== 'draft'}
          label="validation_rules"
          onChange={(value) => patch({ validation_rules: value })}
          value={draft.validation_rules ?? {}}
        />
      </div>

      <label className="grid gap-2 text-sm font-bold">
        <span>change_summary</span>
        <textarea
          className="ds-input min-h-20 py-3"
          disabled={revision.status !== 'draft'}
          onChange={(event) => patch({ change_summary: event.target.value || null })}
          value={draft.change_summary ?? ''}
        />
      </label>

      {preview ? (
        <pre className="max-h-80 overflow-auto rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 text-xs">
          {JSON.stringify(preview, null, 2)}
        </pre>
      ) : null}

      {revisionDiff ? (
        <div className="grid gap-2">
          <h5 className="font-black">Active diff</h5>
          <div className="grid max-h-80 gap-2 overflow-auto">
            {revisionDiff.changes
              .filter((change) => change.changed)
              .map((change) => (
                <div
                  className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3"
                  key={change.field}
                >
                  <strong className="block text-sm">{change.field}</strong>
                  <pre className="mt-2 overflow-auto text-xs">
                    {JSON.stringify({ before: change.before, after: change.after }, null, 2)}
                  </pre>
                </div>
              ))}
            {revisionDiff.changes.every((change) => !change.changed) ? (
              <p className="ds-muted text-sm font-semibold">没有字段变化。</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function JsonEditor({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: Record<string, unknown>) => void;
  value: Record<string, unknown>;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <label className="grid gap-2 text-sm font-bold">
      <span>{label}</span>
      <textarea
        className="ds-input min-h-40 py-3 font-mono text-xs"
        disabled={disabled}
        onBlur={() => onChange(parseJsonObject(text))}
        onChange={(event) => setText(event.target.value)}
        value={text}
      />
    </label>
  );
}

function renderParameterInput(
  field: ParameterSchemaField,
  value: string | number | boolean | null,
  updateField: (key: string, value: string | number | boolean | null) => void,
) {
  const id = `parameter-${field.key}`;

  if (field.type === 'boolean') {
    return (
      <label className="flex min-h-12 items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] px-4 font-bold">
        <input
          checked={Boolean(value)}
          id={id}
          onChange={(event) => updateField(field.key, event.target.checked)}
          type="checkbox"
        />
        {field.placeholder ?? field.label}
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <select
        className="ds-input"
        id={id}
        onChange={(event) => updateField(field.key, event.target.value)}
        required={field.required}
        value={value === null || value === undefined ? '' : String(value)}
      >
        <option value="">请选择</option>
        {(field.options ?? []).map((option) => (
          <option key={`${option.label}-${option.value}`} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="ds-input"
      id={id}
      max={field.max}
      min={field.min}
      onChange={(event) => {
        if (field.type === 'number' || field.type === 'integer') {
          updateField(field.key, event.target.value === '' ? null : Number(event.target.value));
          return;
        }
        updateField(field.key, event.target.value);
      }}
      placeholder={field.placeholder}
      required={field.required}
      type={field.type === 'string' ? 'text' : 'number'}
      value={value === null || value === undefined ? '' : String(value)}
    />
  );
}

function renderStudioQuickParameterControls(
  config: StudioQuickParameterConfig,
  field: ParameterSchemaField,
  patchField: (patch: Partial<ParameterSchemaField>) => void,
) {
  if (config.kind === 'count') {
    return (
      <div className="grid gap-3">
        <DsInput
          label="默认张数"
          min={0}
          onChange={(event) =>
            patchField({
              default: event.target.value === '' ? undefined : Number(event.target.value),
              type: 'integer',
            })
          }
          type="number"
          value={field.default === undefined || field.default === null ? '' : String(field.default)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <DsInput
            label="最小值"
            min={0}
            onChange={(event) =>
              patchField({
                min: event.target.value === '' ? undefined : Number(event.target.value),
                type: 'integer',
              })
            }
            type="number"
            value={field.min ?? ''}
          />
          <DsInput
            label="最大值"
            min={0}
            onChange={(event) =>
              patchField({
                max: event.target.value === '' ? undefined : Number(event.target.value),
                type: 'integer',
              })
            }
            type="number"
            value={field.max ?? ''}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-2 text-sm font-bold">
        <span>选项</span>
        <textarea
          className="ds-input min-h-28 py-3"
          onChange={(event) =>
            patchField({
              options: parseSchemaOptionLines(event.target.value),
              type: 'select',
            })
          }
          value={formatSchemaOptionLines(field.options ?? [])}
        />
      </label>
      <DsInput
        label="默认值"
        onChange={(event) =>
          patchField({
            default: event.target.value || undefined,
            type: 'select',
          })
        }
        placeholder="需要匹配某个 option value"
        value={field.default === undefined || field.default === null ? '' : String(field.default)}
      />
    </div>
  );
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('默认参数必须是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
}

function areParameterValuesEqual(
  left: Record<string, string | number | boolean | null>,
  right: Record<string, string | number | boolean | null>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function findStudioQuickParameterField(
  schema: ParameterSchemaField[],
  config: StudioQuickParameterConfig,
) {
  return schema.find((field) => field.ui?.group === 'quick' && field.ui?.slot === config.slot);
}

function upsertStudioQuickParameterField(
  schema: ParameterSchemaField[],
  config: StudioQuickParameterConfig,
  field: ParameterSchemaField,
) {
  const existingField = findStudioQuickParameterField(schema, config);
  const nextField = {
    ...field,
    ui: {
      ...(field.ui ?? {}),
      group: 'quick',
      slot: config.slot,
    },
  };
  if (!existingField) {
    return [...schema, nextField];
  }
  return schema.map((item) => (item.key === existingField.key ? nextField : item));
}

function removeStudioQuickParameterField(
  schema: ParameterSchemaField[],
  config: StudioQuickParameterConfig,
) {
  const field = findStudioQuickParameterField(schema, config);
  if (!field) {
    return schema;
  }
  return schema.filter((item) => item.key !== field.key);
}

function formatSchemaOptionLines(options: ParameterSchemaOption[]) {
  return options.map((option) => `${option.label}|${String(option.value)}`).join('\n');
}

function parseSchemaOptionLines(rawValue: string): ParameterSchemaOption[] {
  return rawValue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, value] = line.includes('|') ? line.split('|', 2) : [line, line];
      return {
        label: label.trim(),
        value: value.trim(),
      };
    });
}

function emptyProfilePayload(model: AdminAiModel): ExecutionProfilePayload {
  return {
    name: 'New execution profile',
    operation: 'text_to_image',
    adapter_key: 'openai_images_generation',
    adapter_version: '1',
    transport_key: 'new_api_bearer',
    upstream_model_id: model.model_id,
    upstream_endpoint_path: '/v1/images/generations',
    reference_transfer_mode: 'none',
    supports_reference_image: false,
    max_reference_images: 0,
    parameter_schema: model.default_execution_profile?.parameter_schema ?? model.parameter_schema,
    default_params: model.default_execution_profile?.default_params ?? model.default_params,
    request_mapping: {
      content_type: 'json',
      fields: [
        { source: 'model', target: 'model' },
        { source: 'prompt', target: 'prompt' },
      ],
    },
    response_parser_key: 'openai_image_data',
    capabilities: {},
    validation_rules: {},
    is_default: false,
    is_enabled: true,
    sort_order: 0,
  };
}

function profileToPayload(profile: AdminExecutionProfile): ExecutionProfilePayload {
  return {
    name: profile.name,
    operation: profile.operation,
    adapter_key: profile.adapter_key,
    adapter_version: profile.adapter_version,
    transport_key: profile.transport_key,
    upstream_model_id: profile.upstream_model_id,
    upstream_endpoint_path: profile.upstream_endpoint_path,
    reference_transfer_mode: profile.reference_transfer_mode,
    supports_reference_image: profile.supports_reference_image,
    max_reference_images: profile.max_reference_images,
    parameter_schema: profile.parameter_schema,
    default_params: profile.default_params,
    request_mapping: profile.request_mapping,
    response_parser_key: profile.response_parser_key,
    capabilities: profile.capabilities,
    validation_rules: profile.validation_rules,
    is_default: profile.is_default,
    is_enabled: profile.is_enabled,
    sort_order: profile.sort_order,
  };
}

function revisionToPayload(
  revision: AdminExecutionProfileRevision,
): ExecutionProfileRevisionPayload {
  return {
    source_kind: revision.source_kind,
    source_url: revision.source_url,
    source_checked_at: revision.source_checked_at,
    source_summary: revision.source_summary,
    adapter_key: revision.adapter_key,
    adapter_version: revision.adapter_version,
    transport_key: revision.transport_key,
    upstream_model_id: revision.upstream_model_id,
    upstream_endpoint_path: revision.upstream_endpoint_path,
    reference_transfer_mode: revision.reference_transfer_mode,
    supports_reference_image: revision.supports_reference_image,
    max_reference_images: revision.max_reference_images,
    parameter_schema: revision.parameter_schema,
    default_params: revision.default_params,
    request_mapping: revision.request_mapping,
    response_parser_key: revision.response_parser_key,
    capabilities: revision.capabilities,
    validation_rules: revision.validation_rules,
    change_summary: revision.change_summary,
  };
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 16);
}
