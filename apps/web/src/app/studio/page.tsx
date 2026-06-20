'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type PublicAiModel,
  type ModelModality,
  unfavoriteModel,
} from '@/lib/model-catalog';

type StudioModelFilter = 'all' | ModelModality | 'favorite';

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);

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

  useEffect(() => {
    if (selectedModel && filteredModels.some((model) => model.id === selectedModel.id)) {
      return;
    }
    const nextSelectedModel = filteredModels[0] ?? null;
    setSelectedModel(nextSelectedModel);
    setParameterValues({});
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

  function selectFilter(filter: StudioModelFilter) {
    setSelectedFilter(filter);
  }

  function selectModel(model: PublicAiModel) {
    setSelectedModel(model);
    setParameterValues({});
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

        <section className={`studio-canvas-panel ${activeTasks.length > 0 ? 'has-task-dock' : ''}`}>
          <div className="studio-canvas-grid" />
          <StudioCanvas
            activeTasks={activeTasks}
            error={error}
            message={message}
            resultTask={resultTask}
            selectedModel={selectedModel}
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
                  onChange={updateParameterValues}
                  schema={selectedModel?.parameter_schema ?? []}
                  value={parameterValues}
                />
              </div>
            </details>
          </div>
        </form>
      </section>
    </main>
  );
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
}: {
  activeTasks: ImageTask[];
  error: string | null;
  message: string | null;
  resultTask: ImageTask | null;
  selectedModel: PublicAiModel | null;
}) {
  const activeTask = activeTasks[0] ?? null;

  return (
    <div className="studio-canvas-content">
      <div className="studio-alert-stack">
        {error ? <p className="studio-alert studio-alert-error">{error}</p> : null}
        {message ? <p className="studio-alert studio-alert-success">{message}</p> : null}
      </div>

      {resultTask ? (
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
