'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/auth-provider';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { ApiClientError } from '@/lib/auth';
import {
  batchDeleteAssets,
  deleteAsset,
  fetchAssets,
  formatAssetBytes,
  formatAssetDate,
  uploadReferenceImage,
  type AssetItem,
  type AssetKind,
} from '@/lib/assets';

function ReferenceImageUploader({
  csrfToken,
  onUploaded,
}: {
  csrfToken: string | null;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    if (!file) {
      setError('请选择参考图');
      return;
    }

    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      await uploadReferenceImage(file, csrfToken);
      setFile(null);
      setMessage('参考图已上传。');
      onUploaded();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="ds-card grid gap-4 p-5" onSubmit={submitUpload}>
      <div>
        <span className="ds-badge">Reference</span>
        <h2 className="mt-4 text-xl font-black">上传参考图</h2>
        <p className="ds-muted mt-2 text-sm">支持 JPEG、PNG、WebP、GIF，文件名仅用于展示。</p>
      </div>
      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="ds-input py-2"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        type="file"
      />
      {file ? (
        <p className="ds-muted text-sm">
          {file.name} · {formatAssetBytes(String(file.size))}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}
      <DsButton className="w-fit" disabled={uploading} type="submit">
        {uploading ? '上传中...' : '上传参考图'}
      </DsButton>
    </form>
  );
}

function BatchDeleteToolbar({
  disabled,
  onDelete,
  selectedCount,
}: {
  disabled: boolean;
  onDelete: () => void;
  selectedCount: number;
}) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="sticky top-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] px-4 py-3 shadow-sm">
      <p className="text-sm font-black">已选择 {selectedCount} 个资产</p>
      <DsButton disabled={disabled} onClick={onDelete} type="button" variant="danger">
        批量删除
      </DsButton>
    </div>
  );
}

function AssetGrid({
  items,
  onDelete,
  onPreview,
  onToggleSelected,
  selectedIds,
}: {
  items: AssetItem[];
  onDelete: (asset: AssetItem) => void;
  onPreview: (asset: AssetItem) => void;
  onToggleSelected: (assetId: string) => void;
  selectedIds: Set<string>;
}) {
  if (items.length === 0) {
    return (
      <section className="ds-card grid place-items-center p-10 text-center">
        <div className="max-w-md">
          <span className="ds-badge">Empty</span>
          <h2 className="mt-5 text-2xl font-black">我的作品暂时为空</h2>
          <p className="ds-muted mt-3 leading-7">
            开始创作后，结果图会进入这里。也可以先上传参考图供后续任务使用。
          </p>
          <Link className="ds-button mt-6" href="/studio">
            进入创作台
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((asset) => (
        <article className="ds-card overflow-hidden" key={asset.id}>
          <button
            className="block aspect-[4/3] w-full bg-[var(--ds-surface-muted)]"
            onClick={() => onPreview(asset)}
            type="button"
          >
            <img
              alt={asset.filename}
              className="h-full w-full object-contain"
              src={asset.download_url}
            />
          </button>
          <div className="grid gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black">{asset.filename}</h3>
                <p className="ds-muted mt-1 text-xs">
                  {formatAssetBytes(asset.size_bytes)} · {asset.width ?? '-'} x{' '}
                  {asset.height ?? '-'}
                </p>
              </div>
              <input
                aria-label={`选择 ${asset.filename}`}
                checked={selectedIds.has(asset.id)}
                onChange={() => onToggleSelected(asset.id)}
                type="checkbox"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="ds-button ds-button-secondary min-h-9 px-3 text-sm"
                href={asset.download_url}
              >
                下载
              </a>
              <DsButton
                className="min-h-9 px-3 text-sm"
                onClick={() => onPreview(asset)}
                type="button"
                variant="secondary"
              >
                查看
              </DsButton>
              <DsButton
                className="min-h-9 px-3 text-sm"
                onClick={() => onDelete(asset)}
                type="button"
                variant="danger"
              >
                删除
              </DsButton>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function AssetPreviewDialog({ asset, onClose }: { asset: AssetItem | null; onClose: () => void }) {
  if (!asset) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/45 p-4">
      <section className="ds-card max-h-[92vh] w-full max-w-4xl overflow-auto bg-[var(--ds-surface-raised)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="ds-badge">
              {asset.kind === 'reference_image' ? 'Reference' : 'Result'}
            </span>
            <h2 className="mt-4 truncate text-2xl font-black">{asset.filename}</h2>
          </div>
          <DsButton onClick={onClose} type="button" variant="secondary">
            关闭
          </DsButton>
        </div>
        <div className="mt-5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-3">
          <img
            alt={asset.filename}
            className="mx-auto max-h-[58vh] object-contain"
            src={asset.download_url}
          />
        </div>
        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="ds-muted font-semibold">尺寸</dt>
            <dd className="mt-1 font-black">
              {asset.width ?? '-'} x {asset.height ?? '-'}
            </dd>
          </div>
          <div>
            <dt className="ds-muted font-semibold">大小</dt>
            <dd className="mt-1 font-black">{formatAssetBytes(asset.size_bytes)}</dd>
          </div>
          <div>
            <dt className="ds-muted font-semibold">创建时间</dt>
            <dd className="mt-1 font-black">{formatAssetDate(asset.created_at)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function StudioAssetsContent() {
  const { csrfToken } = useAuth();
  const [kind, setKind] = useState<AssetKind>('result_image');
  const [items, setItems] = useState<AssetItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  async function loadAssets(nextKind = kind) {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchAssets(nextKind);
      setItems(payload.items);
      setSelectedIds(new Set());
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取资产失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAssets(kind);
  }, [kind]);

  const selectedList = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  function toggleSelected(assetId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  async function deleteOne(asset: AssetItem) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await deleteAsset(asset.id, csrfToken);
      setMessage('资产已删除。');
      await loadAssets(kind);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    if (selectedIds.size === 0) {
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await batchDeleteAssets([...selectedIds], csrfToken);
      setMessage(`已删除 ${selectedIds.size} 个资产。`);
      await loadAssets(kind);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '批量删除失败');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="ds-shell min-h-screen py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="ds-badge">Assets</span>
          <h1 className="mt-4 text-3xl font-black">我的作品</h1>
          <p className="ds-muted mt-2">管理自己的结果图和参考图。</p>
        </div>
        <Link className="ds-button ds-button-secondary" href="/studio">
          返回创作台
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="grid gap-4">
          <div className="ds-card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              {(['result_image', 'reference_image'] as AssetKind[]).map((item) => (
                <button
                  className={`ds-button min-h-10 px-4 ${
                    kind === item ? '' : 'ds-button-secondary'
                  }`}
                  key={item}
                  onClick={() => setKind(item)}
                  type="button"
                >
                  {item === 'result_image' ? '结果图' : '参考图'}
                </button>
              ))}
            </div>
            <DsButton
              disabled={loading}
              onClick={() => loadAssets(kind)}
              type="button"
              variant="secondary"
            >
              刷新
            </DsButton>
          </div>

          <BatchDeleteToolbar
            disabled={deleting}
            onDelete={deleteSelected}
            selectedCount={selectedList.length}
          />

          {message ? (
            <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
              {error}
            </p>
          ) : null}
          {loading ? (
            <section className="ds-card p-6">
              <p className="ds-muted font-semibold">正在读取资产...</p>
            </section>
          ) : (
            <AssetGrid
              items={items}
              onDelete={deleteOne}
              onPreview={setPreviewAsset}
              onToggleSelected={toggleSelected}
              selectedIds={selectedIds}
            />
          )}
        </section>

        <ReferenceImageUploader csrfToken={csrfToken} onUploaded={() => loadAssets(kind)} />
      </div>

      <AssetPreviewDialog asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </main>
  );
}

export default function StudioAssetsPage() {
  return (
    <RouteGuard requireNewApiConfig>
      <StudioAssetsContent />
    </RouteGuard>
  );
}
