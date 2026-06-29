'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Crop,
  Download,
  ImagePlus,
  Images,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
} from 'lucide-react';

import { useAuth } from '@/components/auth-provider';
import { RouteGuard } from '@/components/route-guard';
import { ApiClientError, type AuthUser } from '@/lib/auth';
import { uploadReferenceImage, uploadReferenceImageFromUrl, type AssetItem } from '@/lib/assets';
import {
  createImageTask,
  deleteImageTask,
  fetchImageTasks,
  taskStatusLabel,
  taskStatusTone,
  type ImageTask,
  type PublicTaskAsset,
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
type StudioParameterValue = string | number | boolean | null;
type StudioReferencePreview = Pick<AssetItem, 'id' | 'download_url' | 'filename'>;

const MAX_SELECTED_REFERENCES = 8;
const QUICK_COUNT_PRESET_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const STUDIO_QUICK_PARAM_STORAGE_KEY = 'dreamstudio:studio:quick-params:v1';

interface QuickParameterConfig {
  fields: ParameterSchemaField[];
  icon: ReactNode;
  kind: QuickParameterKind;
  label: string;
}

interface StudioCanvasTile {
  asset: PublicTaskAsset | null;
  id: string;
  status: ImageTask['status'];
}

interface StudioCanvasBatch {
  completedTileCount: number;
  task: ImageTask;
  tileCount: number;
  tiles: StudioCanvasTile[];
}

type StudioBatchActionKey = 'reference-all' | 'edit' | 'regenerate' | 'download-all' | 'delete';

function createClientRequestId() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }

  if (cryptoObject?.getRandomValues) {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function StudioContent() {
  const { csrfToken } = useAuth();
  const [models, setModels] = useState<PublicAiModel[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<StudioModelFilter>('all');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<PublicAiModel | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, StudioParameterValue>>({});
  const [prompt, setPrompt] = useState('');
  const [selectedReferences, setSelectedReferences] = useState<StudioReferencePreview[]>([]);
  const [modelTasks, setModelTasks] = useState<ImageTask[]>([]);
  const [taskTileCountHints, setTaskTileCountHints] = useState<Record<string, number>>({});
  const [taskHistoryOpen, setTaskHistoryOpen] = useState(false);
  const [taskHistorySearchQuery, setTaskHistorySearchQuery] = useState('');
  const [taskHistoryLoading, setTaskHistoryLoading] = useState(false);
  const [taskHistoryError, setTaskHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<PublicTaskAsset | null>(null);
  const [showModelIntro, setShowModelIntro] = useState(true);
  const [openQuickParameter, setOpenQuickParameter] = useState<QuickParameterKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [activeBatchAction, setActiveBatchAction] = useState<StudioBatchActionKey | null>(null);
  const [hydratedQuickParameterBucketKey, setHydratedQuickParameterBucketKey] = useState<
    string | null
  >(null);
  const quickParameterRef = useRef<HTMLDivElement | null>(null);
  const taskHistoryRef = useRef<HTMLDivElement | null>(null);
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
    if (!openQuickParameter && !taskHistoryOpen) {
      return;
    }

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (openQuickParameter && !quickParameterRef.current?.contains(target)) {
        setOpenQuickParameter(null);
      }
      if (taskHistoryOpen && !taskHistoryRef.current?.contains(target)) {
        setTaskHistoryOpen(false);
      }
    }

    window.addEventListener('click', closeOnOutsideClick);
    return () => window.removeEventListener('click', closeOnOutsideClick);
  }, [openQuickParameter, taskHistoryOpen]);

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
          setModelTasks(sortImageTasksByCreatedAtDesc(payload.items));
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
      if (model.modality === 'image' && !model.default_execution_profile) {
        return false;
      }
      if (model.default_execution_profile?.adapter_key === 'gemini_interactions_image') {
        return false;
      }
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
  const selectedExecutionProfile = selectedModel?.default_execution_profile ?? null;
  const selectedParameterSchema =
    selectedExecutionProfile?.parameter_schema ?? selectedModel?.parameter_schema ?? [];
  const selectedDefaultParams =
    selectedExecutionProfile?.default_params ?? selectedModel?.default_params ?? {};
  const selectedSupportsReferenceImage =
    selectedExecutionProfile?.supports_reference_image ??
    selectedModel?.supports_reference_image ??
    false;
  const selectedMaxReferenceImages = Math.max(
    0,
    selectedExecutionProfile?.max_reference_images ??
      (selectedSupportsReferenceImage ? MAX_SELECTED_REFERENCES : 0),
  );
  const quickParameters = useMemo(
    () => buildQuickParameters(selectedParameterSchema),
    [selectedParameterSchema],
  );
  const resolvedQuickParameterValues = useMemo(
    () => mergeQuickParameterDefaults(quickParameters, parameterValues, selectedDefaultParams),
    [parameterValues, quickParameters, selectedDefaultParams],
  );
  const quickParameterFields = useMemo(
    () => quickParameters.flatMap((config) => config.fields),
    [quickParameters],
  );
  const selectedQuickCountField = useMemo(
    () => findQuickParameterFieldByKind(quickParameters, 'count'),
    [quickParameters],
  );
  const quickParameterBucketKey = useMemo(
    () =>
      buildQuickParameterBucketKey(
        selectedModel?.model_id ?? null,
        selectedExecutionProfile?.revision_id ?? null,
      ),
    [selectedExecutionProfile?.revision_id, selectedModel?.model_id],
  );
  useEffect(() => {
    if (selectedModel && filteredModels.some((model) => model.id === selectedModel.id)) {
      return;
    }
    const nextSelectedModel = filteredModels[0] ?? null;
    setSelectedModel(nextSelectedModel);
    setParameterValues({});
    setShowModelIntro(Boolean(nextSelectedModel));
    setPreviewAsset(null);
    setOpenQuickParameter(null);
    if (!getModelSupportsReferenceImage(nextSelectedModel)) {
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
    setPreviewAsset(null);
  }, [selectedModelId, modelTasks[0]?.id]);

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

  useEffect(() => {
    if (!quickParameterBucketKey) {
      setHydratedQuickParameterBucketKey(null);
      setParameterValues({});
      return;
    }
    const restoredValues = loadQuickParameterMemory(quickParameterBucketKey, quickParameterFields);
    setParameterValues(restoredValues);
    setHydratedQuickParameterBucketKey(quickParameterBucketKey);
  }, [quickParameterBucketKey, quickParameterFields]);

  useEffect(() => {
    if (!quickParameterBucketKey || hydratedQuickParameterBucketKey !== quickParameterBucketKey) {
      return;
    }
    persistQuickParameterMemory(
      quickParameterBucketKey,
      buildQuickParameterMemoryPayload(quickParameterFields, parameterValues),
    );
  }, [
    hydratedQuickParameterBucketKey,
    parameterValues,
    quickParameterBucketKey,
    quickParameterFields,
  ]);

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
    setOpenQuickParameter(null);
    setPreviewAsset(null);
    if (!getModelSupportsReferenceImage(model)) {
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
      const resolvedParameters = mergeQuickParameterDefaults(
        quickParameters,
        parameterValues,
        selectedDefaultParams,
      );
      const expectedTileCount = resolveExpectedTileCount(quickParameters, resolvedParameters);
      const created = await createImageTask(
        {
          model_record_id: selectedModel.id,
          execution_profile_id: selectedExecutionProfile?.id ?? null,
          prompt,
          negative_prompt: null,
          parameters: resolvedParameters,
          reference_asset_ids: selectedReferences.map((reference) => reference.id),
          client_request_id: createClientRequestId(),
        },
        csrfToken,
      );
      setTaskTileCountHints((current) => ({
        ...current,
        [created.item.id]: expectedTileCount,
      }));
      taskHistoryRequestIdRef.current += 1;
      setTaskHistoryLoading(false);
      setModelTasks((current) =>
        sortImageTasksByCreatedAtDesc([
          created.item,
          ...current.filter((task) => task.id !== created.item.id),
        ]).slice(0, 50),
      );
      setMessage('任务已提交。');
      setShowModelIntro(false);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '任务提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function createTaskFromSnapshot(task: ImageTask) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return null;
    }
    if (!selectedModel || selectedModel.id !== task.model_record_id) {
      setError('请先切回该任务对应的模型');
      return null;
    }
    if (!selectedImageModelSupported) {
      setError('当前模型暂不支持图片任务');
      return null;
    }
    const promptSummary = task.prompt_summary.trim();
    if (!promptSummary) {
      setError('当前任务没有可复用的 Prompt 摘要');
      return null;
    }

    const parameters = normalizeSnapshotParameters(task.sanitized_parameter_snapshot);
    const defaultParameters = normalizeSnapshotParameters(selectedDefaultParams);
    const expectedTileCount = resolveExpectedTileCount(quickParameters, {
      ...defaultParameters,
      ...parameters,
    });
    const created = await createImageTask(
      {
        model_record_id: selectedModel.id,
        execution_profile_id: selectedExecutionProfile?.id ?? task.execution_profile_id,
        prompt: promptSummary,
        negative_prompt: null,
        parameters,
        reference_asset_ids: task.reference_asset_ids,
        client_request_id: createClientRequestId(),
      },
      csrfToken,
    );
    setTaskTileCountHints((current) => ({
      ...current,
      [created.item.id]: expectedTileCount,
    }));
    taskHistoryRequestIdRef.current += 1;
    setTaskHistoryLoading(false);
    setModelTasks((current) =>
      sortImageTasksByCreatedAtDesc([
        created.item,
        ...current.filter((item) => item.id !== created.item.id),
      ]).slice(0, 50),
    );
    setShowModelIntro(false);
    return created.item;
  }

  async function convertResultAssetsToReferences(
    assets: PublicTaskAsset[],
    options: { replace?: boolean } = {},
  ) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return [];
    }
    if (!selectedSupportsReferenceImage || selectedMaxReferenceImages <= 0) {
      setError('当前模型不支持参考图');
      return [];
    }
    const baseCount = options.replace ? 0 : selectedReferences.length;
    const remainingSlots = selectedMaxReferenceImages - baseCount;
    if (remainingSlots <= 0) {
      setError(`最多只能选择 ${selectedMaxReferenceImages} 张参考图`);
      return [];
    }
    const uploadableAssets = assets.slice(0, remainingSlots);
    if (uploadableAssets.length === 0) {
      setError('当前任务暂无可引用的结果图');
      return [];
    }

    const uploadedAssets = await Promise.all(
      uploadableAssets.map(async (asset) => {
        const uploaded = await uploadReferenceImageFromUrl(
          asset.download_url,
          buildReferenceFilename(asset),
          csrfToken,
        );
        return uploaded.item;
      }),
    );
    const nextReferences = uploadedAssets.map(toStudioReferencePreview);
    setSelectedReferences((current) =>
      options.replace
        ? addSelectedReferences([], nextReferences, selectedMaxReferenceImages)
        : addSelectedReferences(current, nextReferences, selectedMaxReferenceImages),
    );
    return nextReferences;
  }

  async function handleReferenceBatch(batch: StudioCanvasBatch) {
    const nextReferences = await convertResultAssetsToReferences(batch.task.result_assets);
    if (nextReferences.length > 0) {
      setMessage(
        nextReferences.length > 1
          ? `${nextReferences.length} 张结果图已加入参考图。`
          : '结果图已加入参考图。',
      );
    }
  }

  async function handleEditBatch(batch: StudioCanvasBatch) {
    const firstAsset = batch.task.result_assets[0];
    if (!firstAsset) {
      setError('当前任务暂无可编辑的结果图');
      return;
    }
    const nextReferences = await convertResultAssetsToReferences([firstAsset], { replace: true });
    if (nextReferences.length === 0) {
      return;
    }
    setPrompt(batch.task.prompt_summary);
    setParameterValues(normalizeSnapshotParameters(batch.task.sanitized_parameter_snapshot));
    setMessage('已用第一张结果图创建参考图，并回填当前描述。');
  }

  async function handleRegenerateBatch(batch: StudioCanvasBatch) {
    const created = await createTaskFromSnapshot(batch.task);
    if (created) {
      setMessage('已按当前描述再次生成。');
    }
  }

  function handleDownloadBatch(batch: StudioCanvasBatch) {
    if (batch.task.result_assets.length === 0) {
      setError('当前任务暂无可下载的结果图');
      return;
    }
    batch.task.result_assets.forEach((asset, index) => {
      window.setTimeout(() => {
        triggerAssetDownload(asset);
      }, index * 120);
    });
    setMessage(
      batch.task.result_assets.length > 1 ? '已开始下载全部结果图。' : '已开始下载结果图。',
    );
  }

  async function handleDeleteBatch(batch: StudioCanvasBatch) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    await deleteImageTask(batch.task.id, csrfToken);
    setModelTasks((current) => current.filter((task) => task.id !== batch.task.id));
    setTaskTileCountHints((current) => {
      const nextHints = { ...current };
      delete nextHints[batch.task.id];
      return nextHints;
    });
    setPreviewAsset(null);
    setMessage('任务已删除。');
  }

  async function handleBatchAction(action: StudioBatchActionKey, batch: StudioCanvasBatch) {
    if (activeBatchAction) {
      return;
    }
    setActiveBatchAction(action);
    setError(null);
    setMessage(null);
    try {
      if (action === 'reference-all') {
        await handleReferenceBatch(batch);
      } else if (action === 'edit') {
        await handleEditBatch(batch);
      } else if (action === 'regenerate') {
        await handleRegenerateBatch(batch);
      } else if (action === 'download-all') {
        handleDownloadBatch(batch);
      } else if (action === 'delete') {
        await handleDeleteBatch(batch);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : batchActionError(action));
    } finally {
      setActiveBatchAction(null);
    }
  }

  async function uploadReference(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0 || !csrfToken) {
      return;
    }
    const remainingSlots = selectedMaxReferenceImages - selectedReferences.length;
    if (remainingSlots <= 0) {
      setError(`最多只能上传 ${selectedMaxReferenceImages} 张参考图`);
      return;
    }
    const uploadableFiles = files.slice(0, remainingSlots);
    setUploadingReference(true);
    setError(
      files.length > uploadableFiles.length
        ? `最多只能上传 ${selectedMaxReferenceImages} 张参考图`
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
        addSelectedReferences(
          current,
          uploadedAssets.map(toStudioReferencePreview),
          selectedMaxReferenceImages,
        ),
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

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    event.currentTarget.form?.requestSubmit();
  }

  const selectedImageModelSupported = Boolean(
    selectedModel?.modality === 'image' &&
    selectedExecutionProfile &&
    [
      'openai_images_generation',
      'openai_images_edit',
      'openai_responses_image',
      'gemini_generate_content',
    ].includes(selectedExecutionProfile.adapter_key),
  );
  const canSubmit = Boolean(selectedImageModelSupported && prompt.trim() && !submitting);
  const latestTask = modelTasks[0] ?? null;
  const latestCanvasBatch = useMemo(
    () =>
      buildStudioCanvasBatch(
        latestTask,
        selectedQuickCountField,
        latestTask ? taskTileCountHints[latestTask.id] : undefined,
      ),
    [latestTask, selectedQuickCountField, taskTileCountHints],
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
              refElement={taskHistoryRef}
              searchQuery={taskHistorySearchQuery}
              tasks={modelTasks}
            />
            <StudioCanvas
              activeAction={activeBatchAction}
              batch={latestCanvasBatch}
              error={error}
              message={message}
              onBatchAction={handleBatchAction}
              onClosePreview={() => setPreviewAsset(null)}
              onOpenPreview={setPreviewAsset}
              previewAsset={previewAsset}
              quickParameters={quickParameters}
              referenceLimit={selectedMaxReferenceImages}
              selectedReferenceCount={selectedReferences.length}
              selectedReferences={selectedReferences}
              selectedModel={selectedModel}
              supportsReferenceImage={selectedSupportsReferenceImage}
              showModelIntro={showModelIntro}
            />
          </section>

          <form className="studio-composer" onSubmit={submitTask}>
            <div
              className={`studio-composer-main ${
                selectedReferences.length > 0 ? 'has-reference-selection' : ''
              }`}
            >
              <label className="sr-only" htmlFor="studio-reference-upload">
                上传参考图
              </label>
              <StudioReferenceUploader
                disabled={!selectedSupportsReferenceImage || selectedMaxReferenceImages <= 0}
                inputId="studio-reference-upload"
                maxReferences={selectedMaxReferenceImages}
                onRemove={removeReference}
                onUpload={uploadReference}
                references={selectedReferences}
                uploading={uploadingReference}
              />
              <div className="studio-composer-body">
                <textarea
                  className="studio-prompt-input"
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="描述你想生成的画面..."
                  value={prompt}
                />
              </div>
              <div className="studio-composer-rail">
                <div className="studio-composer-rail-leading">
                  <StudioReferenceRailButton
                    disabled={!selectedSupportsReferenceImage || selectedMaxReferenceImages <= 0}
                    inputId="studio-reference-upload"
                    maxReferences={selectedMaxReferenceImages}
                    references={selectedReferences}
                    uploading={uploadingReference}
                  />
                  <QuickParameterBar
                    configs={quickParameters}
                    onOpenChange={setOpenQuickParameter}
                    openKind={openQuickParameter}
                    resolvedValues={resolvedQuickParameterValues}
                    refElement={quickParameterRef}
                    updateParameterValues={updateParameterValues}
                    values={parameterValues}
                  />
                </div>
                <div className="studio-composer-actions">
                  <button
                    aria-label={submitting ? '正在提交任务' : '提交生成任务'}
                    className="studio-submit-button"
                    disabled={!canSubmit}
                    title={submitting ? '提交中' : '提交生成任务'}
                    type="submit"
                  >
                    <Send aria-hidden="true" size={17} strokeWidth={2.4} />
                  </button>
                </div>
              </div>
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
  resolvedValues,
  refElement,
  updateParameterValues,
  values,
}: {
  configs: QuickParameterConfig[];
  onOpenChange: (kind: QuickParameterKind | null) => void;
  openKind: QuickParameterKind | null;
  resolvedValues: Record<string, StudioParameterValue>;
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
        const value = formatQuickParameterValue(config.fields, resolvedValues);
        const isOpen = openKind === config.kind;
        return (
          <div className="studio-quick-param" key={config.kind}>
            <button
              aria-label={`${config.label}：${value}`}
              aria-expanded={isOpen}
              className={`studio-quick-param-trigger ${isOpen ? 'is-active' : ''}`}
              onClick={() => onOpenChange(isOpen ? null : config.kind)}
              type="button"
            >
              <span aria-hidden="true" className="studio-quick-param-icon">
                {config.icon}
              </span>
              <small>{value}</small>
            </button>
            {isOpen ? (
              <div className="studio-quick-param-popover">
                <div className="studio-quick-param-head">
                  <span aria-hidden="true">{config.icon}</span>
                  <strong>{config.label}</strong>
                </div>
                {config.fields.map((field) => (
                  <div className="studio-quick-field" key={field.key}>
                    {config.fields.length > 1 ? <span>{field.label}</span> : null}
                    {config.kind === 'count' && supportsQuickCountPresets(field) ? (
                      <CountQuickFieldControl
                        field={field}
                        onChange={(nextValue) =>
                          updateParameterValues(setQuickParameterOverride(values, field.key, nextValue))
                        }
                        onCommit={() => onOpenChange(null)}
                        value={resolvedValues[field.key] ?? field.default ?? null}
                      />
                    ) : (
                      <ParameterFieldControl
                        field={field}
                        onChange={(nextValue) =>
                          updateParameterValues(setQuickParameterOverride(values, field.key, nextValue))
                        }
                        onCommit={() => onOpenChange(null)}
                        value={resolvedValues[field.key] ?? field.default ?? null}
                      />
                    )}
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
  onCommit,
  value,
}: {
  field: ParameterSchemaField;
  onChange: (value: string | number | boolean | null) => void;
  onCommit?: () => void;
  value: string | number | boolean | null;
}) {
  if (field.type === 'select') {
    return (
      <div className="studio-quick-options">
        {(field.options ?? []).map((option) => (
          <button
            className={value === option.value ? 'is-active' : ''}
            key={String(option.value)}
            onClick={() => {
              onChange(option.value);
              onCommit?.();
            }}
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
          onChange={(event) => {
            onChange(event.target.checked);
            onCommit?.();
          }}
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
      onBlur={() => onCommit?.()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        onCommit?.();
      }}
      placeholder={field.placeholder}
      step={field.type === 'integer' ? 1 : undefined}
      type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
      value={inputValue}
    />
  );
}

function CountQuickFieldControl({
  field,
  onChange,
  onCommit,
  value,
}: {
  field: ParameterSchemaField;
  onChange: (value: string | number | boolean | null) => void;
  onCommit: () => void;
  value: string | number | boolean | null;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const numericValue = readQuickCountValue(value);
  const isCustomValue =
    numericValue !== null &&
    !QUICK_COUNT_PRESET_VALUES.some((presetValue) => presetValue === numericValue);

  useEffect(() => {
    setCustomValue(numericValue === null ? '' : String(numericValue));
    setCustomError(null);
    if (!isCustomValue) {
      setCustomOpen(false);
    }
  }, [field.key, isCustomValue, numericValue]);

  useEffect(() => {
    if (!customOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      customInputRef.current?.focus();
      customInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customOpen]);

  function submitCustomValue() {
    const trimmedValue = customValue.trim();
    if (trimmedValue === '') {
      setCustomError('请输入张数');
      return;
    }
    const parsedValue = Number(trimmedValue);
    if (!Number.isInteger(parsedValue)) {
      setCustomError('张数必须是整数');
      return;
    }
    if (field.min !== undefined && parsedValue < field.min) {
      setCustomError(`张数不能小于 ${field.min}`);
      return;
    }
    if (field.max !== undefined && parsedValue > field.max) {
      setCustomError(`张数不能大于 ${field.max}`);
      return;
    }
    setCustomError(null);
    setCustomOpen(false);
    onChange(parsedValue);
    onCommit();
  }

  return (
    <div className="studio-count-field">
      <div className="studio-quick-options studio-count-presets">
        {QUICK_COUNT_PRESET_VALUES.map((presetValue) => {
          const disabled =
            (field.min !== undefined && presetValue < field.min) ||
            (field.max !== undefined && presetValue > field.max);
          return (
            <button
              aria-disabled={disabled}
              className={numericValue === presetValue ? 'is-active' : ''}
              disabled={disabled}
              key={presetValue}
              onClick={() => {
                setCustomError(null);
                setCustomOpen(false);
                onChange(presetValue);
                onCommit();
              }}
              type="button"
            >
              {presetValue}
            </button>
          );
        })}
        <button
          className={customOpen || isCustomValue ? 'is-active' : ''}
          onClick={() => {
            setCustomValue(numericValue === null ? '' : String(numericValue));
            setCustomError(null);
            setCustomOpen(true);
          }}
          type="button"
        >
          自定义
        </button>
      </div>
      {customOpen || isCustomValue ? (
        <div className="studio-count-custom">
          <input
            className={`studio-quick-input ${customError ? 'is-error' : ''}`}
            inputMode="numeric"
            max={field.max}
            min={field.min}
            onBlur={submitCustomValue}
            onChange={(event) => {
              setCustomValue(event.target.value);
              if (customError) {
                setCustomError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return;
              }
              event.preventDefault();
              submitCustomValue();
            }}
            placeholder="输入张数"
            ref={customInputRef}
            step={1}
            type="number"
            value={customValue}
          />
          {customError ? <span className="studio-quick-field-error">{customError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function buildQuickParameters(schema: ParameterSchemaField[]): QuickParameterConfig[] {
  const usedKeys = new Set<string>();
  const configs: QuickParameterConfig[] = [];
  const candidateSchema = schema
    .filter((field) => field.ui?.group === 'quick' && field.ui?.slot)
    .sort((left, right) => getFieldUiOrder(left) - getFieldUiOrder(right));

  const definitions: Array<{
    fields: (schema: ParameterSchemaField[], usedKeys: Set<string>) => ParameterSchemaField[];
    icon: ReactNode;
    kind: QuickParameterKind;
    label: string;
  }> = [
    {
      fields: (items, keys) => findSingleQuickFieldBySlots(items, keys, ['count']),
      icon: <Layers3 size={15} strokeWidth={1.8} />,
      kind: 'count',
      label: '张数',
    },
    {
      fields: (items, keys) => findSingleQuickFieldBySlots(items, keys, ['aspect_ratio']),
      icon: <Crop size={15} strokeWidth={1.8} />,
      kind: 'size',
      label: '比例',
    },
    {
      fields: (items, keys) => findSingleQuickFieldBySlots(items, keys, ['resolution']),
      icon: <Square size={15} strokeWidth={1.8} />,
      kind: 'resolution',
      label: '分辨率',
    },
  ];

  for (const definition of definitions) {
    const fields = definition.fields(candidateSchema, usedKeys);
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

function findSingleQuickFieldBySlots(
  schema: ParameterSchemaField[],
  usedKeys: Set<string>,
  slots: string[],
) {
  const slotSet = new Set(slots);
  const field = schema.find(
    (item) => !usedKeys.has(item.key) && item.ui?.slot && slotSet.has(item.ui.slot),
  );
  return field ? [field] : [];
}

function getFieldUiOrder(field: ParameterSchemaField) {
  return typeof field.ui?.order === 'number' ? field.ui.order : Number.MAX_SAFE_INTEGER;
}

function findQuickParameterFieldByKind(
  configs: QuickParameterConfig[],
  kind: QuickParameterKind,
): ParameterSchemaField | null {
  return configs.find((config) => config.kind === kind)?.fields[0] ?? null;
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

function supportsQuickCountPresets(field: ParameterSchemaField) {
  return field.type === 'integer' || field.type === 'number';
}

function setQuickParameterOverride(
  values: Record<string, StudioParameterValue>,
  key: string,
  nextValue: StudioParameterValue,
) {
  const nextValues = { ...values };
  if (nextValue === null) {
    delete nextValues[key];
    return nextValues;
  }
  nextValues[key] = nextValue;
  return nextValues;
}

function readQuickCountValue(value: string | number | boolean | null) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function mergeQuickParameterDefaults(
  configs: QuickParameterConfig[],
  values: Record<string, string | number | boolean | null>,
  defaults: Record<string, unknown>,
) {
  const nextValues: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (isParameterValue(value)) {
      nextValues[key] = value;
    }
  }
  Object.assign(nextValues, values);
  for (const config of configs) {
    for (const field of config.fields) {
      if (
        !Object.prototype.hasOwnProperty.call(nextValues, field.key) &&
        field.default !== undefined
      ) {
        nextValues[field.key] = field.default;
      }
    }
  }
  return nextValues;
}

function resolveExpectedTileCount(
  configs: QuickParameterConfig[],
  values: Record<string, StudioParameterValue>,
) {
  const countField = findQuickParameterFieldByKind(configs, 'count');
  if (!countField) {
    return 1;
  }
  return normalizeTileCountValue(countField, values[countField.key]) ?? 1;
}

function sortImageTasksByCreatedAtDesc(tasks: ImageTask[]) {
  return [...tasks].sort((left, right) => {
    const timeDiff = getTaskSortTimestamp(right) - getTaskSortTimestamp(left);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return right.id.localeCompare(left.id);
  });
}

function getTaskSortTimestamp(task: ImageTask) {
  return (
    parseTimestamp(task.created_at) ??
    parseTimestamp(task.queued_at) ??
    parseTimestamp(task.updated_at) ??
    0
  );
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildQuickParameterBucketKey(modelId: string | null, revisionId: string | null) {
  if (!modelId) {
    return null;
  }
  return `${modelId}:${revisionId ?? 'no-revision'}`;
}

function loadQuickParameterMemory(bucketKey: string, fields: ParameterSchemaField[]) {
  const storage = readQuickParameterStorage();
  const bucket = storage[bucketKey];
  if (!isRecord(bucket)) {
    return {};
  }
  const restoredValues: Record<string, StudioParameterValue> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(bucket, field.key)) {
      continue;
    }
    const normalizedValue = normalizeQuickParameterValue(field, bucket[field.key]);
    if (normalizedValue !== undefined) {
      restoredValues[field.key] = normalizedValue;
    }
  }
  return restoredValues;
}

function buildQuickParameterMemoryPayload(
  fields: ParameterSchemaField[],
  values: Record<string, StudioParameterValue>,
) {
  const payload: Record<string, StudioParameterValue> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field.key)) {
      continue;
    }
    const normalizedValue = normalizeQuickParameterValue(field, values[field.key]);
    if (normalizedValue !== undefined) {
      payload[field.key] = normalizedValue;
    }
  }
  return payload;
}

function persistQuickParameterMemory(
  bucketKey: string,
  payload: Record<string, StudioParameterValue>,
) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const storage = readQuickParameterStorage();
    if (Object.keys(payload).length === 0) {
      delete storage[bucketKey];
    } else {
      storage[bucketKey] = payload;
    }
    window.localStorage.setItem(STUDIO_QUICK_PARAM_STORAGE_KEY, JSON.stringify(storage));
  } catch {
    // Ignore storage quota and JSON errors in the browser-only preference layer.
  }
}

function readQuickParameterStorage(): Record<string, Record<string, StudioParameterValue>> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const rawValue = window.localStorage.getItem(STUDIO_QUICK_PARAM_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }
    const parsedValue = JSON.parse(rawValue);
    if (!isRecord(parsedValue)) {
      return {};
    }
    const storage: Record<string, Record<string, StudioParameterValue>> = {};
    for (const [bucketKey, bucketValue] of Object.entries(parsedValue)) {
      if (isRecord(bucketValue)) {
        storage[bucketKey] = bucketValue as Record<string, StudioParameterValue>;
      }
    }
    return storage;
  } catch {
    return {};
  }
}

function buildStudioCanvasBatch(
  task: ImageTask | null,
  countField: ParameterSchemaField | null,
  hintedTileCount?: number,
): StudioCanvasBatch | null {
  if (!task) {
    return null;
  }

  const inferredTileCount =
    hintedTileCount && hintedTileCount > 0
      ? hintedTileCount
      : inferTileCountFromTaskSnapshot(task, countField) ?? 1;
  const tileCount = Math.max(inferredTileCount, task.result_assets.length, 1);
  const tiles = Array.from({ length: tileCount }, (_, index) => {
    const asset = task.result_assets[index] ?? null;
    return {
      asset,
      id: asset?.id ?? `${task.id}:${index}`,
      status: asset ? 'succeeded' : task.status,
    } satisfies StudioCanvasTile;
  });

  return {
    completedTileCount: task.result_assets.length,
    task,
    tileCount,
    tiles,
  };
}

function inferTileCountFromTaskSnapshot(task: ImageTask, countField: ParameterSchemaField | null) {
  if (!countField) {
    return null;
  }
  return normalizeTileCountValue(countField, task.sanitized_parameter_snapshot[countField.key]);
}

function normalizeSnapshotParameters(snapshot: Record<string, unknown>) {
  const parameters: Record<string, StudioParameterValue> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (isParameterValue(value)) {
      parameters[key] = value;
    }
  }
  return parameters;
}

function resolveStudioBatchCover(
  batch: StudioCanvasBatch,
  selectedReferences: StudioReferencePreview[],
) {
  const firstResult = batch.task.result_assets[0];
  if (firstResult) {
    return {
      download_url: firstResult.download_url,
      filename: firstResult.filename,
    };
  }
  return selectedReferences[0] ?? null;
}

function buildStudioBatchParameterPills(
  batch: StudioCanvasBatch,
  quickParameters: QuickParameterConfig[],
) {
  const snapshot = normalizeSnapshotParameters(batch.task.sanitized_parameter_snapshot);
  return quickParameters
    .map((config) => {
      const value = formatQuickParameterValue(config.fields, snapshot);
      if (!value || value === config.label) {
        return null;
      }
      return {
        key: config.kind,
        label: config.label,
        value,
      };
    })
    .filter((item): item is { key: QuickParameterKind; label: string; value: string } =>
      Boolean(item),
    );
}

function buildReferenceFilename(asset: PublicTaskAsset) {
  const normalizedName = asset.filename.trim();
  if (!normalizedName) {
    return `reference-${asset.id}.png`;
  }
  return normalizedName.replace(/^result[-_]?/i, 'reference-');
}

function triggerAssetDownload(asset: PublicTaskAsset) {
  const link = document.createElement('a');
  link.href = asset.download_url;
  link.download = asset.filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function batchActionError(action: StudioBatchActionKey) {
  switch (action) {
    case 'reference-all':
      return '结果图引用失败';
    case 'edit':
      return '重新编辑失败';
    case 'regenerate':
      return '再次生成失败';
    case 'download-all':
      return '下载结果图失败';
    case 'delete':
      return '删除任务失败';
  }
}

function normalizeTileCountValue(field: ParameterSchemaField, value: unknown) {
  const normalizedValue = normalizeQuickParameterValue(field, value);
  const numericValue =
    normalizedValue === undefined ? null : readQuickCountValue(normalizedValue ?? null);
  if (numericValue === null || !Number.isInteger(numericValue) || numericValue < 1) {
    return null;
  }
  return numericValue;
}

function normalizeQuickParameterValue(
  field: ParameterSchemaField,
  value: unknown,
): StudioParameterValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (field.type === 'select') {
    return matchFieldOptionValue(field.options ?? [], value);
  }

  if (field.type === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return undefined;
  }

  if (field.type === 'integer' || field.type === 'number') {
    const parsedValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsedValue)) {
      return undefined;
    }
    if (field.type === 'integer' && !Number.isInteger(parsedValue)) {
      return undefined;
    }
    if (field.min !== undefined && parsedValue < field.min) {
      return undefined;
    }
    if (field.max !== undefined && parsedValue > field.max) {
      return undefined;
    }
    return parsedValue;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return undefined;
  }
  if (field.options?.length) {
    return matchFieldOptionValue(field.options, trimmedValue);
  }
  return trimmedValue;
}

function matchFieldOptionValue(
  options: Array<{ value: string | number | boolean }>,
  value: unknown,
): string | number | boolean | undefined {
  for (const option of options) {
    if (option.value === value) {
      return option.value;
    }
    if (typeof option.value === 'number' && typeof value === 'string' && value.trim() !== '') {
      const parsedValue = Number(value);
      if (Number.isFinite(parsedValue) && parsedValue === option.value) {
        return option.value;
      }
    }
    if (typeof option.value === 'boolean' && typeof value === 'string') {
      if ((value === 'true' && option.value) || (value === 'false' && !option.value)) {
        return option.value;
      }
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getModelSupportsReferenceImage(model: PublicAiModel | null) {
  return (
    model?.default_execution_profile?.supports_reference_image ??
    model?.supports_reference_image ??
    false
  );
}

function isParameterValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  );
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
  maxReferences = MAX_SELECTED_REFERENCES,
) {
  const selectedIds = new Set(currentReferences.map((reference) => reference.id));
  const mergedReferences = [...currentReferences];
  for (const reference of nextReferences) {
    if (!selectedIds.has(reference.id) && mergedReferences.length < maxReferences) {
      mergedReferences.push(reference);
      selectedIds.add(reference.id);
    }
  }
  return mergedReferences;
}

function StudioReferenceUploader({
  disabled,
  inputId,
  maxReferences,
  onRemove,
  onUpload,
  references,
  uploading,
}: {
  disabled: boolean;
  inputId: string;
  maxReferences: number;
  onRemove: (referenceId: string) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  references: StudioReferencePreview[];
  uploading: boolean;
}) {
  const uploadDisabled = disabled || uploading || references.length >= maxReferences;
  const statusLabel = disabled
    ? '当前模型不支持上传'
    : uploading
      ? '上传中'
      : references.length > 0
        ? `${references.length}/${maxReferences}`
        : null;

  return (
    <div
      className={`studio-reference-uploader ${disabled ? 'is-disabled' : ''} ${
        references.length > 0 ? 'has-references' : ''
      }`}
    >
      <div className="studio-reference-stack" tabIndex={references.length > 0 ? 0 : -1}>
        {references.length === 0 ? (
          <label
            aria-label={disabled ? '当前模型不支持上传' : '上传参考图'}
            className="studio-reference-placeholder"
            htmlFor={inputId}
            title={disabled ? '当前模型不支持上传' : '上传参考图'}
          >
            <Plus aria-hidden="true" className="studio-reference-plus-icon" size={26} />
          </label>
        ) : (
          references.map((reference, index) => (
            <figure
              className="studio-reference-card"
              key={reference.id}
              style={
                {
                  '--reference-index': index,
                  '--reference-stack-x': `${Math.min(index, 4) * 10}px`,
                  '--reference-stack-y': `${Math.min(index, 4) * -4}px`,
                  '--reference-rotation': `${index % 2 === 0 ? -6 : 5}deg`,
                  '--reference-focus-x': `${index * 96}px`,
                  '--reference-expanded-x': `${index * 96}px`,
                  '--reference-mobile-expanded-x': `${index * 86}px`,
                  '--reference-expanded-y': `${index % 2 === 0 ? 0 : 10}px`,
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
            aria-label={uploadDisabled ? (statusLabel ?? '无法继续上传参考图') : '继续上传参考图'}
            className={`studio-reference-add ${uploadDisabled ? 'is-disabled' : ''}`}
            htmlFor={inputId}
            style={
              {
                '--reference-index': references.length,
                '--reference-stack-x': `${Math.min(references.length, 2) * 22 + 34}px`,
                '--reference-stack-y': `${Math.min(references.length, 3) * -4}px`,
                '--reference-rotation': `${references.length % 2 === 0 ? -5 : 4}deg`,
                '--reference-focus-x': `${references.length * 96}px`,
                '--reference-expanded-x': `${references.length * 96}px`,
                '--reference-mobile-expanded-x': `${references.length * 86}px`,
                '--reference-expanded-y': `${references.length % 2 === 0 ? 0 : 10}px`,
                '--reference-expanded-rotation': `${references.length % 2 === 0 ? -3 : 3}deg`,
              } as CSSProperties
            }
            title={uploadDisabled ? (statusLabel ?? '无法继续上传参考图') : '继续上传参考图'}
          >
            <Plus aria-hidden="true" className="studio-reference-plus-icon" size={24} />
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
      {statusLabel ? <span className="studio-reference-status">{statusLabel}</span> : null}
    </div>
  );
}

function StudioReferenceRailButton({
  disabled,
  inputId,
  maxReferences,
  references,
  uploading,
}: {
  disabled: boolean;
  inputId: string;
  maxReferences: number;
  references: StudioReferencePreview[];
  uploading: boolean;
}) {
  const uploadDisabled = disabled || uploading || references.length >= maxReferences;
  const label = disabled
    ? '不支持'
    : uploading
      ? '上传中'
      : references.length > 0
        ? `${references.length}/${maxReferences}`
        : '添加';

  return (
    <label
      aria-disabled={uploadDisabled}
      className={`studio-reference-rail-button ${uploadDisabled ? 'is-disabled' : ''}`}
      htmlFor={uploadDisabled ? undefined : inputId}
      title={disabled ? '当前模型不支持上传参考图' : '上传参考图'}
    >
      <Images aria-hidden="true" size={16} strokeWidth={1.9} />
      <span>{label}</span>
    </label>
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

      <Link className="studio-user-entry" href="/console/account">
        <span className="studio-user-avatar">{getStudioUserInitial(user)}</span>
        <span className="studio-user-copy">
          <strong>{user?.display_name?.trim() || user?.username || 'DreamStudio 用户'}</strong>
          <small>
            <span className="studio-user-status-dot" />
            用户后台
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
  activeAction,
  batch,
  error,
  message,
  onBatchAction,
  onClosePreview,
  onOpenPreview,
  previewAsset,
  quickParameters,
  referenceLimit,
  selectedReferenceCount,
  selectedReferences,
  selectedModel,
  supportsReferenceImage,
  showModelIntro,
}: {
  activeAction: StudioBatchActionKey | null;
  batch: StudioCanvasBatch | null;
  error: string | null;
  message: string | null;
  onBatchAction: (action: StudioBatchActionKey, batch: StudioCanvasBatch) => void;
  onClosePreview: () => void;
  onOpenPreview: (asset: PublicTaskAsset) => void;
  previewAsset: PublicTaskAsset | null;
  quickParameters: QuickParameterConfig[];
  referenceLimit: number;
  selectedReferenceCount: number;
  selectedReferences: StudioReferencePreview[];
  selectedModel: PublicAiModel | null;
  supportsReferenceImage: boolean;
  showModelIntro: boolean;
}) {
  const shouldShowModelIntro = Boolean(showModelIntro && selectedModel && !batch);

  useEffect(() => {
    if (!previewAsset) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClosePreview();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClosePreview, previewAsset]);

  useEffect(() => {
    if (!previewAsset) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewAsset]);

  return (
    <>
      <div className="studio-canvas-content">
        <div className="studio-alert-stack" aria-live="polite">
          {error ? <p className="studio-alert studio-alert-error">{error}</p> : null}
          {message ? <p className="studio-alert studio-alert-success">{message}</p> : null}
        </div>

        {shouldShowModelIntro && selectedModel ? (
          <ModelIntro model={selectedModel} />
        ) : batch ? (
          <StudioCanvasBatchView
            activeAction={activeAction}
            batch={batch}
            onBatchAction={onBatchAction}
            onOpenPreview={onOpenPreview}
            quickParameters={quickParameters}
            referenceLimit={referenceLimit}
            selectedReferenceCount={selectedReferenceCount}
            selectedReferences={selectedReferences}
            supportsReferenceImage={supportsReferenceImage}
          />
        ) : (
          <div className="studio-empty-canvas">
            <div className="studio-empty-mark">
              {selectedModel?.display_name.slice(0, 1) ?? 'D'}
            </div>
            <h2>等待第一张画面</h2>
            <p>{selectedModel?.display_name ?? '选择一个图片模型'}</p>
          </div>
        )}
      </div>

      {previewAsset ? (
        <StudioPreviewOverlay asset={previewAsset} onClose={onClosePreview} />
      ) : null}
    </>
  );
}

function StudioCanvasBatchView({
  activeAction,
  batch,
  onBatchAction,
  onOpenPreview,
  quickParameters,
  referenceLimit,
  selectedReferenceCount,
  selectedReferences,
  supportsReferenceImage,
}: {
  activeAction: StudioBatchActionKey | null;
  batch: StudioCanvasBatch;
  onBatchAction: (action: StudioBatchActionKey, batch: StudioCanvasBatch) => void;
  onOpenPreview: (asset: PublicTaskAsset) => void;
  quickParameters: QuickParameterConfig[];
  referenceLimit: number;
  selectedReferenceCount: number;
  selectedReferences: StudioReferencePreview[];
  supportsReferenceImage: boolean;
}) {
  const cover = resolveStudioBatchCover(batch, selectedReferences);
  const parameterPills = buildStudioBatchParameterPills(batch, quickParameters);
  const hasResultAssets = batch.task.result_assets.length > 0;
  const canReferenceAll =
    hasResultAssets &&
    supportsReferenceImage &&
    referenceLimit > 0 &&
    selectedReferenceCount < referenceLimit;
  const canEdit = hasResultAssets && supportsReferenceImage && referenceLimit > 0;
  const referenceTitle = !hasResultAssets
    ? '当前任务暂无结果图'
    : !supportsReferenceImage || referenceLimit <= 0
      ? '当前模型不支持参考图'
      : selectedReferenceCount >= referenceLimit
        ? `最多只能选择 ${referenceLimit} 张参考图`
        : '全部引用';

  return (
    <div className="studio-canvas-batch">
      <div className="studio-canvas-batch-meta">
        {cover ? (
          <div className="studio-canvas-batch-cover" aria-hidden="true">
            <img alt="" src={cover.download_url} />
          </div>
        ) : null}
        <div className="studio-canvas-batch-copy">
          <div className="studio-canvas-batch-title-row">
            <strong>{batch.task.prompt_summary}</strong>
            <span className={`studio-canvas-status is-${batch.task.status}`}>
              {taskStatusLabel(batch.task.status)}
            </span>
          </div>
          <div className="studio-canvas-batch-pills" aria-label="任务参数">
            <span>{formatStudioBatchSummary(batch)}</span>
            {parameterPills.map((pill) => (
              <span key={pill.key}>
                {pill.label}: {pill.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="studio-canvas-batch-grid">
        {batch.tiles.map((tile, index) =>
          tile.asset ? (
            <button
              aria-label={`预览结果图 ${index + 1}`}
              className="studio-canvas-tile is-image"
              key={tile.id}
              onClick={() => onOpenPreview(tile.asset!)}
              type="button"
            >
              <img alt={tile.asset.filename} src={tile.asset.download_url} />
            </button>
          ) : (
            <div className={`studio-canvas-tile is-status is-${tile.status}`} key={tile.id}>
              <div className="studio-canvas-tile-body">
                <span className="studio-canvas-tile-index">{index + 1}</span>
                <strong>{taskStatusLabel(tile.status)}</strong>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="studio-canvas-batch-actions" aria-label="结果操作">
        <StudioBatchActionButton
          action="reference-all"
          activeAction={activeAction}
          disabled={!canReferenceAll}
          icon={<ImagePlus aria-hidden="true" size={20} strokeWidth={2.2} />}
          label="全部引用"
          onClick={(action) => onBatchAction(action, batch)}
          title={referenceTitle}
        />
        <StudioBatchActionButton
          action="edit"
          activeAction={activeAction}
          disabled={!canEdit}
          icon={<Pencil aria-hidden="true" size={20} strokeWidth={2.2} />}
          label="重新编辑"
          onClick={(action) => onBatchAction(action, batch)}
          title={canEdit ? '重新编辑' : referenceTitle}
        />
        <StudioBatchActionButton
          action="regenerate"
          activeAction={activeAction}
          icon={<RefreshCw aria-hidden="true" size={20} strokeWidth={2.2} />}
          label="再次生成"
          onClick={(action) => onBatchAction(action, batch)}
          title="按当前描述再次生成"
        />
        <StudioBatchActionButton
          action="download-all"
          activeAction={activeAction}
          disabled={!hasResultAssets}
          icon={<Download aria-hidden="true" size={20} strokeWidth={2.2} />}
          label="全部下载"
          onClick={(action) => onBatchAction(action, batch)}
          title={hasResultAssets ? '全部下载' : '当前任务暂无结果图'}
        />
        <StudioBatchActionButton
          action="delete"
          activeAction={activeAction}
          icon={<Trash2 aria-hidden="true" size={20} strokeWidth={2.2} />}
          label="删除"
          onClick={(action) => onBatchAction(action, batch)}
          title="删除当前任务"
          variant="danger"
        />
      </div>
    </div>
  );
}

function StudioBatchActionButton({
  action,
  activeAction,
  disabled = false,
  icon,
  label,
  onClick,
  title,
  variant,
}: {
  action: StudioBatchActionKey;
  activeAction: StudioBatchActionKey | null;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: (action: StudioBatchActionKey) => void;
  title: string;
  variant?: 'danger';
}) {
  const isBusy = activeAction === action;
  return (
    <button
      className={`studio-canvas-batch-action ${variant === 'danger' ? 'is-danger' : ''}`}
      disabled={disabled || Boolean(activeAction)}
      onClick={() => onClick(action)}
      title={title}
      type="button"
    >
      {icon}
      <span>{isBusy ? '处理中' : label}</span>
    </button>
  );
}

function StudioPreviewOverlay({
  asset,
  onClose,
}: {
  asset: PublicTaskAsset;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="studio-preview-overlay" onClick={() => onClose()} role="presentation">
      <div
        className="studio-preview-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={asset.filename}
      >
        <div className="studio-preview-toolbar">
          <a className="studio-preview-download" download={asset.filename} href={asset.download_url}>
            下载
          </a>
        </div>
        <div className="studio-preview-image-wrap">
          <img alt={asset.filename} src={asset.download_url} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatStudioBatchSummary(batch: StudioCanvasBatch) {
  if (
    (batch.task.status === 'running' ||
      batch.task.status === 'failed' ||
      batch.task.status === 'timeout' ||
      batch.task.status === 'canceled') &&
    batch.completedTileCount > 0
  ) {
    return `${batch.completedTileCount}/${batch.tileCount} 已返回`;
  }
  return `${batch.tileCount} 张`;
}

function StudioTaskHistoryPanel({
  error,
  loading,
  modelName,
  onOpenChange,
  onSearchChange,
  open,
  refElement,
  searchQuery,
  tasks,
}: {
  error: string | null;
  loading: boolean;
  modelName: string;
  onOpenChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  open: boolean;
  refElement: RefObject<HTMLDivElement | null>;
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
    <div className="studio-task-history" ref={refElement}>
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
      <Link className="studio-task-history-detail" href={`/console/tasks/${task.id}`}>
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
