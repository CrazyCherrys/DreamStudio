'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { RouteGuard } from '@/components/route-guard';
import { formatAssetDate } from '@/lib/assets';
import { ApiClientError } from '@/lib/auth';
import { fetchImageTask, taskStatusLabel, taskStatusTone, type ImageTask } from '@/lib/image-tasks';

function TaskDetailContent() {
  const params = useParams<{ task_id: string }>();
  const [task, setTask] = useState<ImageTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTask() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchImageTask(params.task_id);
        setTask(payload.item);
      } catch (requestError) {
        setError(
          requestError instanceof ApiClientError ? requestError.message : '读取任务详情失败',
        );
      } finally {
        setLoading(false);
      }
    }

    void loadTask();
  }, [params.task_id]);

  return (
    <main className="ds-shell min-h-screen py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="ds-badge">Task</span>
          <h1 className="mt-4 text-3xl font-black">任务详情</h1>
        </div>
        <Link className="ds-button ds-button-secondary" href="/studio/tasks">
          返回任务列表
        </Link>
      </header>

      {loading ? <p className="ds-muted font-semibold">正在读取任务详情...</p> : null}
      {error ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}
      {task ? <TaskDetail task={task} /> : null}
    </main>
  );
}

function TaskDetail({ task }: { task: ImageTask }) {
  return (
    <div className="grid gap-5">
      <section className="ds-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-black">{task.prompt_summary}</h2>
            <p className="ds-muted mt-2 break-all">{task.model_id}</p>
          </div>
          <span className={`font-black ${taskStatusTone(task.status)}`}>
            {taskStatusLabel(task.status)}
          </span>
        </div>
        {task.error_message ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] p-3 text-sm font-semibold text-[var(--ds-danger)]">
            {task.error_message}
          </p>
        ) : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="ds-card p-5">
          <h3 className="text-xl font-black">参数快照</h3>
          <pre className="mt-4 max-h-96 overflow-auto rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-4 text-xs">
            {JSON.stringify(task.sanitized_parameter_snapshot, null, 2)}
          </pre>
        </div>
        <div className="ds-card p-5">
          <h3 className="text-xl font-black">参考图</h3>
          <p className="ds-muted mt-4 text-sm">
            {task.reference_asset_ids.length === 0
              ? '无参考图'
              : task.reference_asset_ids.join(', ')}
          </p>
        </div>
      </section>

      <section className="ds-card p-5">
        <h3 className="text-xl font-black">执行配置</h3>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="ds-muted font-semibold">Profile</dt>
            <dd className="mt-1 break-all font-black">
              {task.execution_profile_name ?? task.execution_profile_id ?? '未记录'}
            </dd>
          </div>
          <div>
            <dt className="ds-muted font-semibold">Adapter</dt>
            <dd className="mt-1 break-all font-black">
              {[task.adapter_key, task.adapter_version].filter(Boolean).join(' / ') || '未记录'}
            </dd>
          </div>
          <div>
            <dt className="ds-muted font-semibold">Revision</dt>
            <dd className="mt-1 break-all font-black">
              {task.execution_profile_revision_id ?? '未记录'}
            </dd>
          </div>
          <div>
            <dt className="ds-muted font-semibold">端点</dt>
            <dd className="mt-1 break-all font-black">{task.endpoint_type}</dd>
          </div>
        </dl>
        <pre className="mt-4 max-h-96 overflow-auto rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-4 text-xs">
          {JSON.stringify(task.resolved_request_sanitized_snapshot, null, 2)}
        </pre>
      </section>

      <section className="ds-card p-5">
        <h3 className="text-xl font-black">结果图</h3>
        {task.result_assets.length === 0 ? (
          <p className="ds-muted mt-4 text-sm">暂无结果图。</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {task.result_assets.map((asset) => (
              <a
                className="block rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-3"
                href={asset.download_url}
                key={asset.id}
              >
                <img
                  alt={asset.filename}
                  className="aspect-[4/3] w-full object-contain"
                  src={asset.download_url}
                />
                <span className="mt-2 block truncate text-sm font-black">{asset.filename}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="ds-card p-5">
        <h3 className="text-xl font-black">尝试记录</h3>
        {!task.attempts || task.attempts.length === 0 ? (
          <p className="ds-muted mt-4 text-sm">暂无尝试记录。</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {task.attempts.map((attempt) => (
              <div
                className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 text-sm"
                key={attempt.id}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="font-black">第 {attempt.attempt_no} 次</span>
                  <span className={taskStatusTone(attempt.status)}>
                    {taskStatusLabel(attempt.status)}
                  </span>
                </div>
                <p className="ds-muted mt-2">
                  {formatAssetDate(attempt.started_at)} {'->'}{' '}
                  {formatAssetDate(attempt.finished_at)}
                </p>
                {attempt.error_message ? (
                  <p className="mt-2 text-[var(--ds-danger)]">{attempt.error_message}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function TaskDetailPage() {
  return (
    <RouteGuard requireNewApiConfig>
      <TaskDetailContent />
    </RouteGuard>
  );
}
