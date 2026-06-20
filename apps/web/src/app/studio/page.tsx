'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/auth-provider';
import { ParameterSchemaForm } from '@/components/model-catalog/model-components';
import { RouteGuard } from '@/components/route-guard';
import { ApiClientError } from '@/lib/auth';
import { fetchAssets, formatAssetBytes, uploadReferenceImage, type AssetItem } from '@/lib/assets';
import {
  createImageTask,
  fetchImageTask,
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
type QuickParameterKind = 'count' | 'ratio' | 'resolution';

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
  const [negativePrompt, setNegativePrompt] = useState('');
  const [referenceAssets, setReferenceAssets] = useState<AssetItem[]>([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(new Set());
  const [activeTasks, setActiveTasks] = useState<ImageTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showModelIntro, setShowModelIntro] = useState(true);
  const [openQuickParameter, setOpenQuickParameter] = useState<QuickParameterKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const quickParameterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      setError(null);
      try {
        const [nextModels, referenceList] = await Promise.all([
          fetchPublicModels({ modality: 'image' }),
          fetchAssets('reference_image'),
        ]);
        setModels(nextModels.items);
        setSelectedModel(nextModels.items[0] ?? null);
        setReferenceAssets(referenceList.items);
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
    if (!activeTasks.some((task) => task.status === 'pending' || task.status === 'running')) {
      return;
    }
    const timer = setInterval(() => {
      void refreshActiveTasks();
    }, 2500);
    return () => clearInterval(timer);
  }, [activeTasks]);

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
  const quickParameterKeys = useMemo(
    () => new Set(quickParameters.flatMap((item) => item.fields.map((field) => field.key))),
    [quickParameters],
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
      setSelectedReferenceIds(new Set());
    }
  }, [filteredModels, selectedModel]);

  const updateParameterValues = useCallback(
    (value: Record<string, string | number | boolean | null>) => {
      setParameterValues(value);
    },
    [],
  );

  const updateAdvancedParameterValues = useCallback(
    (value: Record<string, string | number | boolean | null>) => {
      setParameterValues((current) => {
        const quickValues = Object.fromEntries(
          Object.entries(current).filter(([key]) => quickParameterKeys.has(key)),
        );
        return {
          ...quickValues,
          ...value,
        };
      });
    },
    [quickParameterKeys],
  );

  function selectFilter(filter: StudioModelFilter) {
    setSelectedFilter(filter);
  }

  function selectModel(model: PublicAiModel) {
    setSelectedModel(model);
    setParameterValues({});
    setShowModelIntro(true);
    if (!model.supports_reference_image) {
      setSelectedReferenceIds(new Set());
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

  async function refreshActiveTasks() {
    const nextTasks = await Promise.all(
      activeTasks.map(async (task) => {
        if (task.status !== 'pending' && task.status !== 'running') {
          return task;
        }
        try {
          const response = await fetchImageTask(task.id);
          return response.item;
        } catch {
          return task;
        }
      }),
    );
    setActiveTasks(nextTasks);
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
          negative_prompt: negativePrompt.trim() || null,
          parameters: parameterValues,
          reference_asset_ids: [...selectedReferenceIds],
          client_request_id: crypto.randomUUID(),
        },
        csrfToken,
      );
      setActiveTasks((current) => [
        created.item,
        ...current.filter((task) => task.id !== created.item.id),
      ]);
      setMessage('任务已提交。');
      setShowModelIntro(false);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '任务提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadReference(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || !csrfToken) {
      return;
    }
    setUploadingReference(true);
    setError(null);
    try {
      await uploadReferenceImage(file, csrfToken);
      const refreshed = await fetchAssets('reference_image');
      setReferenceAssets(refreshed.items);
      setMessage('参考图已上传。');
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '参考图上传失败');
    } finally {
      setUploadingReference(false);
    }
  }

  function toggleReference(assetId: string) {
    setSelectedReferenceIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  const selectedImageModelSupported = Boolean(
    selectedModel?.modality === 'image' &&
    selectedModel.endpoint_types.some(
      (type) => type === 'openai_image_generations' || type === 'openai_image_edits',
    ),
  );
  const canSubmit = Boolean(selectedImageModelSupported && prompt.trim() && !submitting);
  const resultTask = activeTasks.find((task) => task.result_assets.length > 0) ?? null;
  const runningCount = activeTasks.filter(
    (task) => task.status === 'pending' || task.status === 'running',
  ).length;
  const selectedReferenceAssets = referenceAssets.filter((asset) =>
    selectedReferenceIds.has(asset.id),
  );
  const parameterCount = selectedModel?.parameter_schema.length ?? 0;
  const advancedParameterSchema = useMemo(
    () =>
      (selectedModel?.parameter_schema ?? []).filter((field) => !quickParameterKeys.has(field.key)),
    [quickParameterKeys, selectedModel?.parameter_schema],
  );
  const advancedParameterValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(parameterValues).filter(([key]) => !quickParameterKeys.has(key)),
      ) as Record<string, string | number | boolean | null>,
    [parameterValues, quickParameterKeys],
  );

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
        <StudioTopbar runningCount={runningCount} selectedModel={selectedModel} />

        <section
          className={`studio-creation-panel ${activeTasks.length > 0 ? 'has-task-dock' : ''}`}
        >
          <section className="studio-canvas-panel">
            <div className="studio-canvas-grid" />
            <StudioCanvas
              activeTasks={activeTasks}
              error={error}
              message={message}
              resultTask={resultTask}
              selectedModel={selectedModel}
              showModelIntro={showModelIntro}
            />
            <RecentTaskDock tasks={activeTasks} />
          </section>

          <form className="studio-composer" onSubmit={submitTask}>
            <div className="studio-composer-main">
              <textarea
                className="studio-prompt-input"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="描述你想生成的画面..."
                value={prompt}
              />
              <div className="studio-composer-actions">
                <label
                  className={`studio-tool-button ${
                    selectedModel?.supports_reference_image ? '' : 'studio-tool-button-disabled'
                  }`}
                >
                  {uploadingReference ? '上传中' : '参考图'}
                  <input
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    disabled={uploadingReference || !selectedModel?.supports_reference_image}
                    onChange={uploadReference}
                    type="file"
                  />
                </label>
                <button className="studio-submit-button" disabled={!canSubmit} type="submit">
                  {submitting ? '提交中' : '生成'}
                </button>
              </div>
            </div>

            <div className="studio-composer-meta">
              <span>{selectedModel?.display_name ?? '未选择模型'}</span>
              <span>{parameterCount > 0 ? `${parameterCount} 个参数` : '默认参数'}</span>
              <span>
                {selectedModel?.supports_reference_image
                  ? `${selectedReferenceIds.size} 张参考图`
                  : '不使用参考图'}
              </span>
            </div>

            <QuickParameterBar
              configs={quickParameters}
              onOpenChange={setOpenQuickParameter}
              openKind={openQuickParameter}
              refElement={quickParameterRef}
              updateParameterValues={updateParameterValues}
              values={parameterValues}
            />

            <ReferenceStrip
              referenceAssets={referenceAssets}
              selectedModel={selectedModel}
              selectedReferenceIds={selectedReferenceIds}
              selectedReferenceAssets={selectedReferenceAssets}
              toggleReference={toggleReference}
            />

            <div className="studio-drawer-row">
              <details className="studio-drawer">
                <summary>负向提示</summary>
                <textarea
                  className="studio-secondary-input"
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder="不希望出现的元素"
                  value={negativePrompt}
                />
              </details>

              <details className="studio-drawer studio-advanced-drawer">
                <summary>高级参数</summary>
                <div className="studio-advanced-body">
                  <ParameterSchemaForm
                    onChange={updateAdvancedParameterValues}
                    schema={advancedParameterSchema}
                    value={advancedParameterValues}
                  />
                </div>
              </details>
            </div>
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
      kind: 'ratio',
      label: '比例',
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
  return /aspect|ratio|比例/.test(text);
}

function isResolutionParameter(field: ParameterSchemaField) {
  const text = fieldSearchText(field);
  return (
    /\b(size|resolution|dimension|quality)\b/.test(text) ||
    /尺寸|分辨率|清晰度/.test(text) ||
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

function StudioTopbar({
  runningCount,
  selectedModel,
}: {
  runningCount: number;
  selectedModel: PublicAiModel | null;
}) {
  return (
    <header className="studio-topbar">
      <div className="studio-brand">
        <span className="studio-brand-mark">DS</span>
        <div>
          <p>DreamStudio</p>
          <span>{selectedModel?.provider_name ?? 'AI 创作工作台'}</span>
        </div>
      </div>
      <nav className="studio-topnav">
        <span className="studio-status-pill">
          {runningCount > 0 ? `${runningCount} 个任务进行中` : '工作台就绪'}
        </span>
        <Link className="studio-link-button" href="/studio/assets">
          资产库
        </Link>
        <Link className="studio-link-button studio-link-button-strong" href="/studio/tasks">
          任务列表
        </Link>
      </nav>
    </header>
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
                <strong>{model.display_name}</strong>
                <small>{model.description || model.model_id}</small>
              </span>
              <span className="studio-model-tags">
                <span className={`studio-model-tag studio-model-tag-${model.modality}`}>
                  {modalityLabel(model.modality)}
                </span>
                {model.endpoint_types.map((endpointType) => (
                  <span key={endpointType}>{endpointTypeShortLabel(endpointType)}</span>
                ))}
                {model.is_recommended ? <span>推荐</span> : null}
              </span>
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function StudioCanvas({
  activeTasks,
  error,
  message,
  resultTask,
  selectedModel,
  showModelIntro,
}: {
  activeTasks: ImageTask[];
  error: string | null;
  message: string | null;
  resultTask: ImageTask | null;
  selectedModel: PublicAiModel | null;
  showModelIntro: boolean;
}) {
  const activeTask =
    activeTasks.find((task) => task.status === 'pending' || task.status === 'running') ??
    activeTasks[0] ??
    null;
  const shouldShowModelIntro = Boolean(
    showModelIntro &&
    selectedModel &&
    activeTask?.status !== 'pending' &&
    activeTask?.status !== 'running',
  );

  return (
    <div className="studio-canvas-content">
      <div className="studio-alert-stack">
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

function ReferenceStrip({
  referenceAssets,
  selectedModel,
  selectedReferenceAssets,
  selectedReferenceIds,
  toggleReference,
}: {
  referenceAssets: AssetItem[];
  selectedModel: PublicAiModel | null;
  selectedReferenceAssets: AssetItem[];
  selectedReferenceIds: Set<string>;
  toggleReference: (assetId: string) => void;
}) {
  if (!selectedModel?.supports_reference_image) {
    return null;
  }

  return (
    <div className="studio-reference-strip">
      {referenceAssets.length === 0 ? (
        <span className="studio-reference-empty">暂无参考图</span>
      ) : (
        referenceAssets.map((asset) => (
          <button
            className={`studio-reference-chip ${
              selectedReferenceIds.has(asset.id) ? 'is-active' : ''
            }`}
            key={asset.id}
            onClick={() => toggleReference(asset.id)}
            type="button"
          >
            <img alt={asset.filename} src={asset.download_url} />
            <span>
              <strong>{asset.filename}</strong>
              <small>{formatAssetBytes(asset.size_bytes)}</small>
            </span>
          </button>
        ))
      )}
      {selectedReferenceAssets.length > 0 ? (
        <span className="studio-reference-count">已选 {selectedReferenceAssets.length}</span>
      ) : null}
    </div>
  );
}

function RecentTaskDock({ tasks }: { tasks: ImageTask[] }) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <aside className="studio-task-dock">
      <div className="studio-task-dock-head">
        <span>最近任务</span>
        <Link href="/studio/tasks">全部</Link>
      </div>
      <div className="studio-task-list">
        {tasks.slice(0, 4).map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </aside>
  );
}

function TaskCard({ task }: { task: ImageTask }) {
  return (
    <article className="studio-task-card">
      <div>
        <h3>{task.prompt_summary}</h3>
        <p>{task.model_id}</p>
      </div>
      <span className={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</span>
      {task.error_message ? <p className="studio-task-error">{task.error_message}</p> : null}
      {task.result_assets.length > 0 ? (
        <div className="studio-task-thumbs">
          {task.result_assets.map((asset) => (
            <a href={asset.download_url} key={asset.id}>
              <img alt={asset.filename} src={asset.download_url} />
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function StudioPage() {
  return (
    <RouteGuard requireNewApiConfig>
      <StudioContent />
    </RouteGuard>
  );
}
