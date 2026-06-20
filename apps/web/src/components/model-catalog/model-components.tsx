'use client';

import { useEffect, useMemo, useState } from 'react';

import { DsButton, DsInput } from '@/components/ui';
import {
  emptySchemaField,
  endpointTypeLabel,
  modalityLabel,
  transferModeLabel,
  type AdminAiModel,
  type AiModelPayload,
  type ModelEndpointType,
  type ModelModality,
  type ModelSyncSnapshotDetail,
  type ModelSyncSnapshotPayload,
  type ModelSyncSnapshotSummary,
  type ParameterFieldType,
  type ParameterSchemaField,
  type ReferenceTransferMode,
  uploadModelIcon,
} from '@/lib/model-catalog';

const FIELD_TYPES: ParameterFieldType[] = ['string', 'number', 'integer', 'boolean', 'select'];
const MODEL_MODALITIES: ModelModality[] = ['chat', 'image', 'video'];
const ENDPOINT_TYPES: ModelEndpointType[] = [
  'openai_image_generations',
  'openai_image_edits',
  'gemini_generate_content',
];
const TRANSFER_MODES: ReferenceTransferMode[] = ['none', 'multipart', 'url'];

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
