'use client';

import { useEffect, useMemo, useState } from 'react';

import { DsButton, DsInput } from '@/components/ui';
import {
  emptySchemaField,
  endpointTypeLabel,
  transferModeLabel,
  type AdminAiModel,
  type AdminModelCategory,
  type AiModelPayload,
  type ModelCategoryPayload,
  type ModelEndpointType,
  type ModelSyncSnapshotDetail,
  type ModelSyncSnapshotPayload,
  type ModelSyncSnapshotSummary,
  type ParameterFieldType,
  type ParameterSchemaField,
  type PublicAiModel,
  type PublicModelCategory,
  type ReferenceTransferMode,
} from '@/lib/model-catalog';

const FIELD_TYPES: ParameterFieldType[] = ['string', 'number', 'integer', 'boolean', 'select'];
const ENDPOINT_TYPES: ModelEndpointType[] = [
  'openai_image_generations',
  'openai_image_edits',
  'gemini_generate_content',
];
const TRANSFER_MODES: ReferenceTransferMode[] = ['none', 'multipart', 'url'];

export function ModelCategoryTabs({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: PublicModelCategory[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className={`min-h-10 rounded-[var(--ds-radius-sm)] border px-3 text-sm font-black ${
          selectedCategoryId === null
            ? 'border-[var(--ds-brand)] bg-[var(--ds-brand)] text-white'
            : 'border-[var(--ds-border)] bg-white/70'
        }`}
        onClick={() => onSelect(null)}
        type="button"
      >
        全部
      </button>
      {categories.map((category) => (
        <button
          className={`min-h-10 rounded-[var(--ds-radius-sm)] border px-3 text-sm font-black ${
            selectedCategoryId === category.id
              ? 'border-[var(--ds-brand)] bg-[var(--ds-brand)] text-white'
              : 'border-[var(--ds-border)] bg-white/70'
          }`}
          key={category.id}
          onClick={() => onSelect(category.id)}
          type="button"
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}

export function ModelPicker({
  models,
  selectedModelId,
  onSelect,
}: {
  models: PublicAiModel[];
  selectedModelId: string | null;
  onSelect: (model: PublicAiModel) => void;
}) {
  if (models.length === 0) {
    return (
      <p className="ds-muted rounded-[var(--ds-radius-sm)] bg-white/60 p-4 text-sm">
        暂无可用模型。
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {models.map((model) => (
        <button
          className={`rounded-[var(--ds-radius-sm)] border p-4 text-left transition ${
            selectedModelId === model.id
              ? 'border-[var(--ds-brand)] bg-[var(--ds-brand-soft)]'
              : 'border-[var(--ds-border)] bg-white/70 hover:border-[var(--ds-border-strong)]'
          }`}
          key={model.id}
          onClick={() => onSelect(model)}
          type="button"
        >
          <span className="block font-black">{model.display_name}</span>
          <span className="ds-muted mt-1 block break-all text-xs font-semibold">
            {model.model_id}
          </span>
          <span className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 px-2 py-1">
              {endpointTypeLabel(model.endpoint_type)}
            </span>
            {model.is_recommended ? (
              <span className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-white/70 px-2 py-1 text-[var(--ds-success)]">
                推荐
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

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
      <p className="ds-muted rounded-[var(--ds-radius-sm)] bg-white/60 p-4 text-sm">
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
        <p className="ds-muted rounded-[var(--ds-radius-sm)] bg-white/60 p-4 text-sm">
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
    <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/65 p-4">
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

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <DsInput
          label="default"
          onChange={(event) => updateDefault(event.target.value)}
          value={field.default === undefined || field.default === null ? '' : String(field.default)}
        />
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 px-4 py-3 text-sm font-black">
          <input
            checked={field.required}
            onChange={(event) => patchField({ required: event.target.checked })}
            type="checkbox"
          />
          必填
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
      <pre className="max-h-80 overflow-auto rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/75 p-4 text-xs">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </div>
  );
}

export function ModelForm({
  categories,
  initialModel,
  onSubmit,
  submitting,
}: {
  categories: AdminModelCategory[];
  initialModel?: AdminAiModel | null;
  onSubmit: (payload: AiModelPayload) => Promise<void>;
  submitting: boolean;
}) {
  const [form, setForm] = useState<AiModelPayload>(() => ({
    category_id: initialModel?.category_id ?? categories[0]?.id ?? null,
    model_id: initialModel?.model_id ?? '',
    display_name: initialModel?.display_name ?? '',
    provider_name: initialModel?.provider_name ?? '',
    endpoint_type: initialModel?.endpoint_type ?? 'openai_image_generations',
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

  useEffect(() => {
    setForm((current) => ({
      ...current,
      category_id: current.category_id ?? categories[0]?.id ?? null,
    }));
  }, [categories]);

  function patchForm(patch: Partial<AiModelPayload>) {
    setForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedDefaultParams = parseJsonObject(defaultParamsJson);
    await onSubmit({
      ...form,
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
        <DsInput
          label="排序"
          onChange={(event) => patchForm({ sort_order: Number(event.target.value) })}
          type="number"
          value={form.sort_order}
        />
        <label className="grid gap-2 text-sm font-bold">
          <span>分类</span>
          <select
            className="ds-input"
            onChange={(event) => patchForm({ category_id: event.target.value || null })}
            value={form.category_id ?? ''}
          >
            <option value="">无分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          <span>端点类型</span>
          <select
            className="ds-input"
            onChange={(event) =>
              patchForm({ endpoint_type: event.target.value as ModelEndpointType })
            }
            value={form.endpoint_type}
          >
            {ENDPOINT_TYPES.map((type) => (
              <option key={type} value={type}>
                {endpointTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
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

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 p-4 font-bold">
          <input
            checked={form.supports_reference_image}
            onChange={(event) => patchForm({ supports_reference_image: event.target.checked })}
            type="checkbox"
          />
          支持参考图
        </label>
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 p-4 font-bold">
          <input
            checked={form.is_enabled}
            onChange={(event) => patchForm({ is_enabled: event.target.checked })}
            type="checkbox"
          />
          启用
        </label>
        <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 p-4 font-bold">
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

export function ModelCategoryForm({
  initialCategory,
  onSubmit,
  submitting,
}: {
  initialCategory?: AdminModelCategory | null;
  onSubmit: (payload: ModelCategoryPayload) => Promise<void>;
  submitting: boolean;
}) {
  const [form, setForm] = useState<ModelCategoryPayload>({
    name: initialCategory?.name ?? '',
    slug: initialCategory?.slug ?? '',
    icon: initialCategory?.icon ?? '',
    sort_order: initialCategory?.sort_order ?? 0,
    is_enabled: initialCategory?.is_enabled ?? true,
  });

  function patchForm(patch: Partial<ModelCategoryPayload>) {
    setForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      ...form,
      icon: form.icon || null,
      slug: form.slug.trim(),
      name: form.name.trim(),
    });
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <DsInput
          label="名称"
          onChange={(event) => patchForm({ name: event.target.value })}
          required
          value={form.name}
        />
        <DsInput
          label="slug"
          onChange={(event) => patchForm({ slug: event.target.value })}
          placeholder="general"
          required
          value={form.slug}
        />
        <DsInput
          label="图标"
          onChange={(event) => patchForm({ icon: event.target.value })}
          value={form.icon ?? ''}
        />
        <DsInput
          label="排序"
          onChange={(event) => patchForm({ sort_order: Number(event.target.value) })}
          type="number"
          value={form.sort_order}
        />
      </div>
      <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 p-4 font-bold">
        <input
          checked={form.is_enabled}
          onChange={(event) => patchForm({ is_enabled: event.target.checked })}
          type="checkbox"
        />
        启用分类
      </label>
      <DsButton className="w-fit" disabled={submitting} type="submit">
        {submitting ? '保存中...' : initialCategory ? '保存分类' : '创建分类'}
      </DsButton>
    </form>
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
              className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 p-3 text-left text-sm"
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
        <pre className="min-h-80 overflow-auto rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/75 p-4 text-xs">
          {selectedSnapshot
            ? JSON.stringify(selectedSnapshot.raw_response, null, 2)
            : '选择一个快照查看 raw_response'}
        </pre>
      </div>
    </div>
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
      <label className="flex min-h-12 items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 px-4 font-bold">
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
