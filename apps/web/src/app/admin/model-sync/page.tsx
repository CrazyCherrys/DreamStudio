'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminLayout } from '@/components/layouts';
import { ModelSyncSnapshotPanel } from '@/components/model-catalog/model-components';
import { RouteGuard } from '@/components/route-guard';
import { ApiClientError } from '@/lib/auth';
import {
  createModelSyncSnapshot,
  fetchModelSyncSnapshot,
  fetchModelSyncSnapshots,
  type ModelSyncSnapshotDetail,
  type ModelSyncSnapshotPayload,
  type ModelSyncSnapshotSummary,
} from '@/lib/model-catalog';

function AdminModelSyncContent() {
  const { csrfToken } = useAuth();
  const [snapshots, setSnapshots] = useState<ModelSyncSnapshotSummary[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<ModelSyncSnapshotDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadSnapshots() {
    setLoading(true);
    setError(null);
    try {
      setSnapshots((await fetchModelSyncSnapshots()).items);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取模型快照失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshots();
  }, []);

  async function createSnapshot(payload: ModelSyncSnapshotPayload) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setCreating(true);
    setMessage(null);
    setError(null);
    try {
      const created = await createModelSyncSnapshot(payload, csrfToken);
      setMessage(`已保存 ${created.snapshot.model_count} 个模型候选。`);
      await loadSnapshots();
      await selectSnapshot(created.snapshot.id);
    } catch (requestError) {
      const nextError =
        requestError instanceof ApiClientError ? requestError.message : '拉取模型候选失败';
      setError(nextError);
      throw requestError;
    } finally {
      setCreating(false);
    }
  }

  async function selectSnapshot(snapshotId: string) {
    setError(null);
    try {
      setSelectedSnapshot((await fetchModelSyncSnapshot(snapshotId)).snapshot);
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError ? requestError.message : '读取模型快照详情失败',
      );
    }
  }

  return (
    <section className="ds-card admin-panel p-6">
      <AdminPageHeading title="模型候选拉取" />

      {message ? (
        <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}
      {loading ? <p className="ds-muted mt-4 font-semibold">正在读取快照...</p> : null}

      <div className="mt-6">
        <ModelSyncSnapshotPanel
          creating={creating}
          error={error}
          onCreate={createSnapshot}
          onSelect={selectSnapshot}
          selectedSnapshot={selectedSnapshot}
          snapshots={snapshots}
        />
      </div>
    </section>
  );
}

export default function AdminModelSyncPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminModelSyncContent />
      </AdminLayout>
    </RouteGuard>
  );
}
