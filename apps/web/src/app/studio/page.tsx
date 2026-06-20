'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/auth-provider';
import { RouteGuard } from '@/components/route-guard';
import { ApiClientError, type AuthUser } from '@/lib/auth';
import { uploadReferenceImage, type AssetItem } from '@/lib/assets';
import {
  createImageTask,
  fetchImageTasks,
  taskStatusLabel,
  taskStatusTone,
  type ImageTask,
} from '@/lib/image-tasks';
import {
  endpointTypeShortLabel,
  favoriteModel,
  fetchPublicModels,
  modalityLabel,
  type ParameterSchemaField,
  type PublicAiModel,
  type ModelModality,
  unfavoriteModel,
} from '@/lib/model-catalog';

type StudioModelFilter = 'all' | ModelModality | 'favorite';
type QuickParameterKind = 'count' | 'size' | 'resolution';
type StudioReferencePreview = Pick<AssetItem, 'id' | 'download_url' | 'filename'>;

const MAX_SELECTED_REFERENCES = 8;

interface QuickParameterConfig {
  fields: ParameterSchemaField[];
  icon: string;
  kind: QuickParameterKind;
  label: string;
}

function StudioContent() {
  const { csrfToken } = useAuth();
  const [models, setModels] = useState<PublicAiModel[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<StudioModelFilter>('all');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<PublicAiModel | null>(null);
  const [parameterValues, setParameterValues] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [prompt, setPrompt] = useState('');
  const [selectedReferences, setSelectedReferences] = useState<StudioReferencePreview[]>([]);
  const [modelTasks, setModelTasks] = useState<ImageTask[]>([]);
  const [taskHistoryOpen, setTaskHistoryOpen] = useState(false);
  const [taskHistorySearchQuery, setTaskHistorySearchQuery] = useState('');
  const [taskHistoryLoading, setTaskHistoryLoading] = useState(false);
  const [taskHistoryError, setTaskHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showModelIntro, setShowModelIntro] = useState(true);
  const [openQuickParameter, setOpenQuickParameter] = useState<QuickParameterKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const quickParameterRef = useRef<HTMLDivElement | null>(null);
  const taskHistoryRequestIdRef = useRef(0);
  const selectedModelId = selectedModel?.id ?? null;

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      setError(null);
      try {
        const nextModels = await fetchPublicModels({ modality: 'image' });
        setModels(nextModels.items);
        setSelectedModel(nextModels.items[0] ?? null);
      } catch (requestError) {
        setError(
          requestError instanceof ApiClientError ? requestError.message : '读取创作台数据失败',
        );
      } finally {
        setLoading(false);
      }
    }

    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!openQuickParameter) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && quickParameterRef.current?.contains(target)) {
        return;
      }
      setOpenQuickParameter(null);
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [openQuickParameter]);

  const loadModelTasks = useCallback(
    async (modelRecordId: string, options: { showLoading?: boolean } = {}) => {
      const requestId = taskHistoryRequestIdRef.current + 1;
      taskHistoryRequestIdRef.current = requestId;
      if (options.showLoading) {
        setTaskHistoryLoading(true);
      }
      setTaskHistoryError(null);
      try {
        const payload = await fetchImageTasks({
          status: 'all',
          modelRecordId,
          page: 1,
          pageSize: 50,
        });
        if (taskHistoryRequestIdRef.current === requestId) {
          setModelTasks(payload.items);
        }
      } catch (requestError) {
        if (taskHistoryRequestIdRef.current === requestId) {
          setTaskHistoryError(
            requestError instanceof ApiClientError ? requestError.message : '读取任务历史失败',
          );
        }
      } finally {
        if (taskHistoryRequestIdRef.current === requestId && options.showLoading) {
          setTaskHistoryLoading(false);
        }
      }
    },
    [],
  );

  const filteredModels = useMemo(() => {
    const query = modelSearchQuery.trim().toLowerCase();
    return models.filter((model) => {
      const matchesFilter =
        selectedFilter === 'all'
          ? true
          : selectedFilter === 'favorite'
            ? model.is_favorite
            : model.modality === selectedFilter;
      if (!matchesFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [model.display_name, model.model_id, model.provider_name, model.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [models, modelSearchQuery, selectedFilter]);
  const quickParameters = useMemo(
    () => buildQuickParameters(selectedModel?.parameter_schema ?? []),
    [selectedModel?.parameter_schema],
  );
  useEffect(() => {
    if (selectedModel && filteredModels.some((model) => model.id === selectedModel.id)) {
      return;
    }
    const nextSelectedModel = filteredModels[0] ?? null;
    setSelectedModel(nextSelectedModel);
    setParameterValues({});
    setShowModelIntro(Boolean(nextSelectedModel));
    if (!nextSelectedModel?.supports_reference_image) {
      setSelectedReferences([]);
    }
  }, [filteredModels, selectedModel]);

  useEffect(() => {
    if (!selectedModelId) {
      taskHistoryRequestIdRef.current += 1;
      setModelTasks([]);
      setTaskHistorySearchQuery('');
      setTaskHistoryError(null);
      setTaskHistoryLoading(false);
      return;
    }
    setTaskHistorySearchQuery('');
    void loadModelTasks(selectedModelId, { showLoading: true });
  }, [loadModelTasks, selectedModelId]);

  useEffect(() => {
    if (
      !selectedModelId ||
      !modelTasks.some((task) => task.status === 'pending' || task.status === 'running')
    ) {
      return;
    }
    const timer = setInterval(() => {
      void loadModelTasks(selectedModelId);
    }, 3000);
    return () => clearInterval(timer);
  }, [loadModelTasks, modelTasks, selectedModelId]);

  const updateParameterValues = useCallback(
    (value: Record<string, string | number | boolean | null>) => {
      setParameterValues(value);
    },
    [],
  );

  function selectFilter(filter: StudioModelFilter) {
    setSelectedFilter(filter);
  }

  function selectModel(model: PublicAiModel) {
    setSelectedModel(model);
    setParameterValues({});
    setShowModelIntro(true);
    if (!model.supports_reference_image) {
      setSelectedReferences([]);
    }
  }

  async function toggleModelFavorite(model: PublicAiModel) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    try {
      if (model.is_favorite) {
        await unfavoriteModel(model.id, csrfToken);
      } else {
        await favoriteModel(model.id, csrfToken);
      }
      setModels((current) =>
        current.map((item) =>
          item.id === model.id ? { ...item, is_favorite: !model.is_favorite } : item,
        ),
      );
      setSelectedModel((current) =>
        current?.id === model.id ? { ...current, is_favorite: !model.is_favorite } : current,
      );
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '更新收藏失败');
    }
  }

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    if (!selectedModel) {
      setError('请选择模型');
      return;
    }
    if (!selectedImageModelSupported) {
      setError('当前模型暂不支持图片任务');
      return;
    }
    if (!prompt.trim()) {
      setError('请输入 Prompt');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createImageTask(
        {
          model_record_id: selectedModel.id,
          prompt,
          negative_prompt: null,
          parameters: parameterValues,
          reference_asset_ids: selectedReferences.map((reference) => reference.id),
          client_request_id: crypto.randomUUID(),
        },
        csrfToken,
      );
      taskHistoryRequestIdRef.current += 1;
      setTaskHistoryLoading(false);
      setModelTasks((current) =>
        [created.item, ...current.filter((task) => task.id !== created.item.id)].slice(0, 50),
      );
      setMessage('任务已提交。');
      setShowModelIntro(false);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '任务提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadReference(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0 || !csrfToken) {
      return;
    }
    const remainingSlots = MAX_SELECTED_REFERENCES - selectedReferences.length;
    if (remainingSlots <= 0) {
      setError(`最多只能上传 ${MAX_SELECTED_REFERENCES} 张参考图`);
      return;
    }
    const uploadableFiles = files.slice(0, remainingSlots);
    setUploadingReference(true);
    setError(
      files.length > uploadableFiles.length
        ? `最多只能上传 ${MAX_SELECTED_REFERENCES} 张参考图`
        : null,
    );
    try {
      const uploadedAssets = await Promise.all(
        uploadableFiles.map(async (file) => {
          const uploaded = await uploadReferenceImage(file, csrfToken);
          return uploaded.item;
        }),
      );
      setSelectedReferences((current) =>
        addSelectedReferences(current, uploadedAssets.map(toStudioReferencePreview)),
      );
      setMessage(
        uploadedAssets.length > 1
          ? `${uploadedAssets.length} 张参考图已上传并加入本次生成。`
          : '参考图已上传并加入本次生成。',
      );
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '参考图上传失败');
    } finally {
      setUploadingReference(false);
    }
  }

  function removeReference(referenceId: string) {
    setSelectedReferences((current) => current.filter((reference) => reference.id !== referenceId));
  }

  const selectedImageModelSupported = Boolean(
    selectedModel?.modality === 'image' &&
    selectedModel.endpoint_types.some(
      (type) => type === 'openai_image_generations' || type === 'openai_image_edits',
    ),
  );
  const canSubmit = Boolean(selectedImageModelSupported && prompt.trim() && !submitting);
  const resultTask = modelTasks.find((task) => task.result_assets.length > 0) ?? null;
  return (
    <main className="studio-workspace">
      <StudioModelSidebar
        filteredModels={filteredModels}
        loading={loading}
        modelSearchQuery={modelSearchQuery}
        onSearchChange={setModelSearchQuery}
        onSelectFilter={selectFilter}
        onSelectModel={selectModel}
        onToggleFavorite={toggleModelFavorite}
        selectedFilter={selectedFilter}
        selectedModel={selectedModel}
      />

      <section className="studio-stage">
        <section className="studio-creation-panel">
          <section className="studio-canvas-panel">
            <div className="studio-canvas-grid" />
            <StudioTaskHistoryPanel
              error={taskHistoryError}
              loading={taskHistoryLoading}
              modelName={selectedModel?.display_name ?? '未选择模型'}
              onOpenChange={setTaskHistoryOpen}
              onSearchChange={setTaskHistorySearchQuery}
              open={taskHistoryOpen}
              searchQuery={taskHistorySearchQuery}
              tasks={modelTasks}
            />
            <StudioCanvas
              error={error}
              message={message}
              modelTasks={modelTasks}
              resultTask={resultTask}
              selectedModel={selectedModel}
              showModelIntro={showModelIntro}
            />
          </section>

          <form className="studio-composer" onSubmit={submitTask}>
            <div className="studio-composer-main">
              <label className="sr-only" htmlFor="studio-reference-upload">
                上传参考图
              </label>
              <StudioReferenceUploader
                disabled={!selectedModel?.supports_reference_image}
                inputId="studio-reference-upload"
                onRemove={removeReference}
                onUpload={uploadReference}
                references={selectedReferences}
                uploading={uploadingReference}
              />
              <textarea
                className="studio-prompt-input"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="描述你想生成的画面..."
                value={prompt}
              />
              <button className="studio-submit-button" disabled={!canSubmit} type="submit">
                {submitting ? '提交中' : '生成'}
              </button>
            </div>

            <QuickParameterBar
              configs={quickParameters}
              onOpenChange={setOpenQuickParameter}
              openKind={openQuickParameter}
              refElement={quickParameterRef}
              updateParameterValues={updateParameterValues}
              values={parameterValues}
            />
          </form>
        </section>
      </section>
    </main>
  );
}

function QuickParameterBar({
  configs,
  onOpenChange,
  openKind,
  refElement,
  updateParameterValues,
  values,
}: {
  configs: QuickParameterConfig[];
  onOpenChange: (kind: QuickParameterKind | null) => void;
  openKind: QuickParameterKind | null;
  refElement: RefObject<HTMLDivElement | null>;
  updateParameterValues: (value: Record<string, string | number | boolean | null>) => void;
  values: Record<string, string | number | boolean | null>;
}) {
  if (configs.length === 0) {
    return null;
  }

  return (
    <div className="studio-quick-params" ref={refElement}>
      {configs.map((config) => {
        const value = formatQuickParameterValue(config.fields, values);
        const isOpen = openKind === config.kind;
        return (
          <div className="studio-quick-param" key={config.kind}>
            <button
              aria-expanded={isOpen}
              className={`studio-quick-param-trigger ${isOpen ? 'is-active' : ''}`}
              onClick={() => onOpenChange(isOpen ? null : config.kind)}
              type="button"
            >
              <span aria-hidden="true">{config.icon}</span>
              <strong>{config.label}</strong>
              <small>{value}</small>
            </button>
            {isOpen ? (
              <div className="studio-quick-param-popover">
                <div className="studio-quick-param-head">
                  <span>{config.icon}</span>
                  <strong>{config.label}</strong>
                </div>
                {config.fields.map((field) => (
                  <div className="studio-quick-field" key={field.key}>
                    {config.fields.length > 1 ? <span>{field.label}</span> : null}
                    <ParameterFieldControl
                      field={field}
                      onChange={(nextValue) =>
                        updateParameterValues({
                          ...values,
                          [field.key]: nextValue,
                        })
                      }
                      value={values[field.key] ?? field.default ?? null}
                    />
                    {field.description ? <p>{field.description}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ParameterFieldControl({
  field,
  onChange,
  value,
}: {
  field: ParameterSchemaField;
  onChange: (value: string | number | boolean | null) => void;
  value: string | number | boolean | null;
}) {
  if (field.type === 'select') {
    return (
      <div className="studio-quick-options">
        {(field.options ?? []).map((option) => (
          <button
            className={value === option.value ? 'is-active' : ''}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <label className="studio-quick-toggle">
        <input
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>{field.label}</span>
      </label>
    );
  }

  const inputValue = typeof value === 'boolean' || value === null ? '' : value;

  return (
    <input
      className="studio-quick-input"
      max={field.max}
      min={field.min}
      onChange={(event) => {
        if (event.target.value === '') {
          onChange(null);
          return;
        }
        if (field.type === 'number' || field.type === 'integer') {
          onChange(Number(event.target.value));
          return;
        }
        onChange(event.target.value);
      }}
      placeholder={field.placeholder}
      step={field.type === 'integer' ? 1 : undefined}
      type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
      value={inputValue}
    />
  );
}

function buildQuickParameters(schema: ParameterSchemaField[]): QuickParameterConfig[] {
  const usedKeys = new Set<string>();
  const configs: QuickParameterConfig[] = [];

  const definitions: Array<{
    fields: (schema: ParameterSchemaField[], usedKeys: Set<string>) => ParameterSchemaField[];
    icon: string;
    kind: QuickParameterKind;
    label: string;
  }> = [
    {
      fields: (items, keys) => findSingleQuickField(items, keys, isCountParameter),
      icon: '#',
      kind: 'count',
      label: '张数',
    },
    {
      fields: (items, keys) => findSingleQuickField(items, keys, isRatioParameter),
      icon: '□',
      kind: 'size',
      label: '尺寸',
    },
    {
      fields: findResolutionFields,
      icon: '▣',
      kind: 'resolution',
      label: '分辨率',
    },
  ];

  for (const definition of definitions) {
    const fields = definition.fields(schema, usedKeys);
    if (fields.length === 0) {
      continue;
    }
    fields.forEach((field) => usedKeys.add(field.key));
    configs.push({
      fields,
      icon: definition.icon,
      kind: definition.kind,
      label: definition.label,
    });
  }

  return configs;
}

function findSingleQuickField(
  schema: ParameterSchemaField[],
  usedKeys: Set<string>,
  match: (field: ParameterSchemaField) => boolean,
) {
  const field = schema.find((item) => !usedKeys.has(item.key) && match(item));
  return field ? [field] : [];
}

function findResolutionFields(schema: ParameterSchemaField[], usedKeys: Set<string>) {
  const directField = schema.find(
    (item) =>
      !usedKeys.has(item.key) &&
      isResolutionParameter(item) &&
      !/\b(width|height)\b/.test(fieldSearchText(item)),
  );
  if (directField) {
    return [directField];
  }

  const widthField = schema.find(
    (item) => !usedKeys.has(item.key) && /\b(width|w)\b|宽度/.test(fieldSearchText(item)),
  );
  const heightField = schema.find(
    (item) => !usedKeys.has(item.key) && /\b(height|h)\b|高度/.test(fieldSearchText(item)),
  );
  return [widthField, heightField].filter((field): field is ParameterSchemaField => Boolean(field));
}

function fieldSearchText(field: ParameterSchemaField) {
  return `${field.key} ${field.label} ${field.description ?? ''}`.toLowerCase();
}

function isCountParameter(field: ParameterSchemaField) {
  const text = fieldSearchText(field);
  return /\b(n|count|num|number|quantity|images?)\b/.test(text) || /张数|数量/.test(text);
}

function isRatioParameter(field: ParameterSchemaField) {
  const text = fieldSearchText(field);
  return /\b(aspect|ratio)\b/.test(text) || /比例|画幅|尺寸/.test(text);
}

function isResolutionParameter(field: ParameterSchemaField) {
  const text = fieldSearchText(field);
  return (
    /\b(resolution|dimension|quality)\b/.test(text) ||
    /分辨率|清晰度|像素/.test(text) ||
    /\b(width|height)\b/.test(text)
  );
}

function formatQuickParameterValue(
  fields: ParameterSchemaField[],
  values: Record<string, string | number | boolean | null>,
) {
  if (fields.length > 1) {
    return fields.map((field) => formatQuickFieldValue(field, values[field.key])).join(' x ');
  }
  const field = fields[0];
  if (!field) {
    return '';
  }
  return formatQuickFieldValue(field, values[field.key]);
}

function formatQuickFieldValue(
  field: ParameterSchemaField,
  value: string | number | boolean | null | undefined,
) {
  const normalizedValue = value ?? field.default ?? '';
  const option = field.options?.find((item) => item.value === normalizedValue);
  if (option) {
    return option.label;
  }
  if (normalizedValue === '' || normalizedValue === null) {
    return field.label;
  }
  return String(normalizedValue).replace(/\s*x\s*/i, ' x ');
}

function toStudioReferencePreview(asset: AssetItem): StudioReferencePreview {
  return {
    id: asset.id,
    download_url: asset.download_url,
    filename: asset.filename,
  };
}

function addSelectedReferences(
  currentReferences: StudioReferencePreview[],
  nextReferences: StudioReferencePreview[],
) {
  const selectedIds = new Set(currentReferences.map((reference) => reference.id));
  const mergedReferences = [...currentReferences];
  for (const reference of nextReferences) {
    if (!selectedIds.has(reference.id) && mergedReferences.length < MAX_SELECTED_REFERENCES) {
      mergedReferences.push(reference);
      selectedIds.add(reference.id);
    }
  }
  return mergedReferences;
}

function StudioReferenceUploader({
  disabled,
  inputId,
  onRemove,
  onUpload,
  references,
  uploading,
}: {
  disabled: boolean;
  inputId: string;
  onRemove: (referenceId: string) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  references: StudioReferencePreview[];
  uploading: boolean;
}) {
  const uploadDisabled = disabled || uploading || references.length >= MAX_SELECTED_REFERENCES;
  const statusLabel = disabled
    ? '当前模型不支持上传'
    : uploading
      ? '上传中'
      : references.length > 0
        ? `${references.length}/${MAX_SELECTED_REFERENCES}`
        : '参考图';

  return (
    <div
      className={`studio-reference-uploader ${disabled ? 'is-disabled' : ''} ${
        references.length > 0 ? 'has-references' : ''
      }`}
    >
      <div className="studio-reference-stack" tabIndex={references.length > 0 ? 0 : -1}>
        {references.length === 0 ? (
          <label
            className="studio-reference-placeholder"
            htmlFor={inputId}
            title={disabled ? '当前模型不支持上传' : '上传参考图'}
          >
            <span className="studio-reference-placeholder-plus">+</span>
            <span>参考图</span>
          </label>
        ) : (
          references.map((reference, index) => (
            <figure
              className="studio-reference-card"
              key={reference.id}
              style={
                {
                  '--reference-index': index,
                  '--reference-stack-x': `${Math.min(index, 4) * 8}px`,
                  '--reference-stack-y': `${Math.min(index, 4) * -3}px`,
                  '--reference-rotation': `${index % 2 === 0 ? -6 : 5}deg`,
                  '--reference-focus-x': `${index * 80}px`,
                  '--reference-expanded-x': `${index * 80}px`,
                  '--reference-mobile-expanded-x': `${index * 66}px`,
                  '--reference-expanded-y': `${index % 2 === 0 ? 0 : 8}px`,
                  '--reference-expanded-rotation': `${index % 2 === 0 ? -3 : 3}deg`,
                } as CSSProperties
              }
            >
              <img alt={reference.filename} src={reference.download_url} />
              <button
                aria-label={`移除参考图 ${reference.filename}`}
                className="studio-reference-remove"
                onClick={() => onRemove(reference.id)}
                type="button"
              >
                ×
              </button>
            </figure>
          ))
        )}
        {references.length > 0 ? (
          <label
            className={`studio-reference-add ${uploadDisabled ? 'is-disabled' : ''}`}
            htmlFor={inputId}
            style={
              {
                '--reference-index': references.length,
                '--reference-stack-x': `${Math.min(references.length, 2) * 16 + 24}px`,
                '--reference-stack-y': `${Math.min(references.length, 3) * -3}px`,
                '--reference-rotation': `${references.length % 2 === 0 ? -5 : 4}deg`,
                '--reference-focus-x': `${references.length * 80}px`,
                '--reference-expanded-x': `${references.length * 80}px`,
                '--reference-mobile-expanded-x': `${references.length * 66}px`,
                '--reference-expanded-y': `${references.length % 2 === 0 ? 0 : 8}px`,
                '--reference-expanded-rotation': `${references.length % 2 === 0 ? -3 : 3}deg`,
              } as CSSProperties
            }
            title={uploadDisabled ? statusLabel : '继续上传参考图'}
          >
            <span className="studio-reference-placeholder-plus">+</span>
            <span>参考图</span>
          </label>
        ) : null}
        {references.length > 0 ? (
          <span className="studio-reference-cue" aria-hidden="true">
            +
          </span>
        ) : null}
      </div>
      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        disabled={uploadDisabled}
        id={inputId}
        multiple
        onChange={onUpload}
        type="file"
      />
      <span className="studio-reference-status">{statusLabel}</span>
    </div>
  );
}

function StudioModelSidebar({
  filteredModels,
  loading,
  modelSearchQuery,
  onSearchChange,
  onSelectFilter,
  onSelectModel,
  onToggleFavorite,
  selectedFilter,
  selectedModel,
}: {
  filteredModels: PublicAiModel[];
  loading: boolean;
  modelSearchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectFilter: (filter: StudioModelFilter) => void;
  onSelectModel: (model: PublicAiModel) => void;
  onToggleFavorite: (model: PublicAiModel) => void;
  selectedFilter: StudioModelFilter;
  selectedModel: PublicAiModel | null;
}) {
  const { user } = useAuth();
  const filters: Array<{ key: StudioModelFilter; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'chat', label: '聊天' },
    { key: 'image', label: '图片' },
    { key: 'video', label: '视频' },
    { key: 'favorite', label: '我的' },
  ];

  return (
    <aside className="studio-sidebar">
      <div className="studio-sidebar-head">
        <span className="studio-kicker">模型栏</span>
        <h1>模型选择</h1>
      </div>

      <div className="studio-category-tabs">
        {filters.map((filter) => (
          <button
            className={selectedFilter === filter.key ? 'is-active' : ''}
            key={filter.key}
            onClick={() => onSelectFilter(filter.key)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <label className="studio-model-search" aria-label="搜索模型或功能">
        <span>⌕</span>
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索模型或功能"
          value={modelSearchQuery}
        />
      </label>

      <div className="studio-model-list">
        {loading ? <p className="studio-sidebar-note">正在读取模型目录...</p> : null}
        {!loading && filteredModels.length === 0 ? (
          <p className="studio-sidebar-note">
            {selectedFilter === 'favorite' ? '暂无收藏模型。' : '暂无可用模型。'}
          </p>
        ) : null}
        {filteredModels.map((model) => (
          <div
            className={`studio-model-card ${selectedModel?.id === model.id ? 'is-active' : ''}`}
            key={model.id}
          >
            <button
              aria-label={model.is_favorite ? '取消收藏模型' : '收藏模型'}
              className={`studio-model-favorite ${model.is_favorite ? 'is-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                void onToggleFavorite(model);
              }}
              type="button"
            >
              ☆
            </button>
            <button
              className="studio-model-select"
              onClick={() => onSelectModel(model)}
              type="button"
            >
              <span className="studio-model-icon">
                {model.icon_url ? (
                  <img alt={model.display_name} src={model.icon_url} />
                ) : (
                  model.display_name.slice(0, 1)
                )}
              </span>
              <span className="studio-model-copy">
                <strong className="studio-model-name">{model.display_name}</strong>
                <small className="studio-model-description">
                  {model.description || model.model_id}
                </small>
              </span>
            </button>
          </div>
        ))}
      </div>

      <Link className="studio-user-entry" href="/studio/assets">
        <span className="studio-user-avatar">{getStudioUserInitial(user)}</span>
        <span className="studio-user-copy">
          <strong>{user?.display_name?.trim() || user?.username || 'DreamStudio 用户'}</strong>
          <small>
            <span className="studio-user-status-dot" />
            我的作品
          </small>
        </span>
      </Link>
    </aside>
  );
}

function getStudioUserInitial(user: AuthUser | null) {
  const name = user?.display_name?.trim() || user?.username?.trim() || 'D';
  return name.slice(0, 1).toUpperCase();
}

function StudioCanvas({
  error,
  message,
  modelTasks,
  resultTask,
  selectedModel,
  showModelIntro,
}: {
  error: string | null;
  message: string | null;
  modelTasks: ImageTask[];
  resultTask: ImageTask | null;
  selectedModel: PublicAiModel | null;
  showModelIntro: boolean;
}) {
  const activeTask =
    modelTasks.find((task) => task.status === 'pending' || task.status === 'running') ??
    modelTasks[0] ??
    null;
  const shouldShowModelIntro = Boolean(
    showModelIntro &&
    selectedModel &&
    activeTask?.status !== 'pending' &&
    activeTask?.status !== 'running',
  );

  return (
    <div className="studio-canvas-content">
      <div className="studio-alert-stack" aria-live="polite">
        {error ? <p className="studio-alert studio-alert-error">{error}</p> : null}
        {message ? <p className="studio-alert studio-alert-success">{message}</p> : null}
      </div>

      {shouldShowModelIntro && selectedModel ? (
        <ModelIntro model={selectedModel} />
      ) : resultTask ? (
        <div className="studio-result-frame">
          <div className="studio-result-meta">
            <span>{taskStatusLabel(resultTask.status)}</span>
            <strong>{resultTask.prompt_summary}</strong>
          </div>
          <div className="studio-result-grid">
            {resultTask.result_assets.map((asset) => (
              <a className="studio-result-tile" href={asset.download_url} key={asset.id}>
                <img alt={asset.filename} src={asset.download_url} />
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="studio-empty-canvas">
          <div className="studio-empty-mark">{selectedModel?.display_name.slice(0, 1) ?? 'D'}</div>
          <h2>{activeTask ? taskStatusLabel(activeTask.status) : '等待第一张画面'}</h2>
          <p>{selectedModel?.display_name ?? '选择一个图片模型'}</p>
          {activeTask ? <small>{activeTask.prompt_summary}</small> : null}
        </div>
      )}
    </div>
  );
}

function StudioTaskHistoryPanel({
  error,
  loading,
  modelName,
  onOpenChange,
  onSearchChange,
  open,
  searchQuery,
  tasks,
}: {
  error: string | null;
  loading: boolean;
  modelName: string;
  onOpenChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  open: boolean;
  searchQuery: string;
  tasks: ImageTask[];
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTasks = useMemo(() => {
    if (!normalizedQuery) {
      return tasks;
    }
    return tasks.filter((task) =>
      [task.prompt_summary, task.model_id, taskStatusLabel(task.status)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [normalizedQuery, tasks]);

  return (
    <div className="studio-task-history">
      <button
        aria-expanded={open}
        className="studio-task-history-trigger"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <span>任务列表</span>
        <strong>{tasks.length}</strong>
      </button>

      {open ? (
        <aside className="studio-task-history-panel" aria-label="当前模型任务列表">
          <div className="studio-task-history-head">
            <div className="studio-task-history-title">
              <span>{modelName}</span>
              <strong>
                已显示 {filteredTasks.length}/{tasks.length}
              </strong>
            </div>
            <button
              aria-label="关闭任务列表"
              className="studio-task-history-close"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <label className="studio-task-history-search" aria-label="搜索当前模型任务">
            <span>⌕</span>
            <input
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索 Prompt 或状态"
              value={searchQuery}
            />
          </label>

          <div className="studio-task-history-list">
            {loading ? <p className="studio-task-history-state">正在读取任务...</p> : null}
            {!loading && error ? (
              <p className="studio-task-history-state is-error">{error}</p>
            ) : null}
            {!loading && !error && tasks.length === 0 ? (
              <p className="studio-task-history-state">当前模型暂无历史任务。</p>
            ) : null}
            {!loading && !error && tasks.length > 0 && filteredTasks.length === 0 ? (
              <p className="studio-task-history-state">没有匹配的任务。</p>
            ) : null}
            {!loading && !error
              ? filteredTasks.map((task) => <StudioTaskHistoryRow key={task.id} task={task} />)
              : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function StudioTaskHistoryRow({ task }: { task: ImageTask }) {
  return (
    <article className="studio-task-history-row">
      <div className="studio-task-history-row-main">
        <p>{task.prompt_summary}</p>
        <span>{formatTaskHistoryTime(task.created_at)}</span>
      </div>
      <strong className={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</strong>
      <Link className="studio-task-history-detail" href={`/studio/tasks/${task.id}`}>
        详情
      </Link>
    </article>
  );
}

function ModelIntro({ model }: { model: PublicAiModel }) {
  return (
    <div className="studio-model-intro">
      <div className="studio-model-intro-icon">
        {model.icon_url ? (
          <img alt={model.display_name} src={model.icon_url} />
        ) : (
          model.display_name.slice(0, 1)
        )}
      </div>
      <span className={`studio-model-tag studio-model-tag-${model.modality}`}>
        {modalityLabel(model.modality)}
      </span>
      <h2>{model.display_name}</h2>
      <p>{model.description || model.model_id}</p>
      <div className="studio-model-intro-meta">
        <span>{model.provider_name ?? '默认提供方'}</span>
        <span>{model.model_id}</span>
        {model.endpoint_types.map((endpointType) => (
          <span key={endpointType}>{endpointTypeShortLabel(endpointType)}</span>
        ))}
      </div>
    </div>
  );
}

function formatTaskHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--/-- --:--';
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

export default function StudioPage() {
  return (
    <RouteGuard requireNewApiConfig>
      <StudioContent />
    </RouteGuard>
  );
}
