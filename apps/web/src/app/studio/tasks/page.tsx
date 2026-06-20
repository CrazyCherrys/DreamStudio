'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/auth-provider';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { formatAssetDate } from '@/lib/assets';
import { ApiClientError } from '@/lib/auth';
import {
  cancelImageTask,
  deleteImageTask,
  fetchImageTasks,
  retryImageTask,
  taskStatusLabel,
  taskStatusTone,
  type ImageTask,
  type ImageTaskStatus,
} from '@/lib/image-tasks';

const STATUS_FILTERS: Array<ImageTaskStatus | 'all'> = [
  'all',
  'pending',
  'running',
  'succeeded',
  'failed',
  'timeout',
  'canceled',
];

function StudioTasksContent() {
  const { csrfToken } = useAuth();
  const [status, setStatus] = useState<ImageTaskStatus | 'all'>('all');
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  async function loadTasks(nextStatus = status) {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchImageTasks(nextStatus);
      setTasks(payload.items);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取任务失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks(status);
  }, [status]);

  useEffect(() => {
    if (!tasks.some((task) => task.status === 'pending' || task.status === 'running')) {
      return;
    }
    const timer = setInterval(() => {
      void loadTasks(status);
    }, 3000);
    return () => clearInterval(timer);
  }, [tasks, status]);

  async function runAction(task: ImageTask, action: 'cancel' | 'retry' | 'delete') {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    setBusyTaskId(task.id);
    setError(null);
    setMessage(null);
    try {
      if (action === 'cancel') {
        await cancelImageTask(task.id, csrfToken);
        setMessage('任务已取消。');
      } else if (action === 'retry') {
        await retryImageTask(task.id, csrfToken);
        setMessage('已创建重试任务。');
      } else {
        await deleteImageTask(task.id, csrfToken);
        setMessage('任务已删除。');
      }
      await loadTasks(status);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '操作失败');
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <main className="ds-shell min-h-screen py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="ds-badge">Tasks</span>
          <h1 className="mt-4 text-3xl font-black">任务列表</h1>
          <p className="ds-muted mt-2">查看图片任务状态、结果和可用操作。</p>
        </div>
        <Link className="ds-button ds-button-secondary" href="/studio">
          返回创作台
        </Link>
      </header>

      <section className="ds-card mb-5 flex flex-wrap gap-2 p-4">
        {STATUS_FILTERS.map((item) => (
          <button
            className={`min-h-10 rounded-[var(--ds-radius-sm)] border px-3 text-sm font-black ${
              status === item
                ? 'border-[var(--ds-brand)] bg-[var(--ds-brand)] text-white'
                : 'border-[var(--ds-border)] bg-white/70'
            }`}
            key={item}
            onClick={() => setStatus(item)}
            type="button"
          >
            {item === 'all' ? '全部' : taskStatusLabel(item)}
          </button>
        ))}
      </section>

      {message ? (
        <p className="mb-5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}

      {loading ? <p className="ds-muted font-semibold">正在读取任务...</p> : null}
      {!loading && tasks.length === 0 ? (
        <section className="ds-card grid place-items-center p-10 text-center">
          <div className="max-w-md">
            <span className="ds-badge">Empty</span>
            <h2 className="mt-5 text-2xl font-black">暂无任务</h2>
            <p className="ds-muted mt-3 leading-7">从创作台提交图片任务后会显示在这里。</p>
            <Link className="ds-button mt-6" href="/studio">
              进入创作台
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4">
        {tasks.map((task) => (
          <TaskListCard
            busy={busyTaskId === task.id}
            key={task.id}
            onAction={runAction}
            task={task}
          />
        ))}
      </div>
    </main>
  );
}

function TaskListCard({
  busy,
  onAction,
  task,
}: {
  busy: boolean;
  onAction: (task: ImageTask, action: 'cancel' | 'retry' | 'delete') => void;
  task: ImageTask;
}) {
  return (
    <article className="ds-card grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black">{task.prompt_summary}</h2>
            <p className="ds-muted mt-1 break-all text-sm">{task.model_id}</p>
          </div>
          <span className={`text-sm font-black ${taskStatusTone(task.status)}`}>
            {taskStatusLabel(task.status)}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="ds-muted font-semibold">创建时间</dt>
            <dd className="mt-1 font-black">{formatAssetDate(task.created_at)}</dd>
          </div>
          <div>
            <dt className="ds-muted font-semibold">参数快照</dt>
            <dd className="mt-1 truncate font-black">
              {JSON.stringify(task.sanitized_parameter_snapshot)}
            </dd>
          </div>
          <div>
            <dt className="ds-muted font-semibold">参考图</dt>
            <dd className="mt-1 font-black">{task.reference_asset_ids.length}</dd>
          </div>
        </dl>

        {task.error_message ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 p-3 text-sm font-semibold text-[var(--ds-danger)]">
            {task.error_message}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {task.status === 'pending' ? (
            <DsButton
              className="min-h-9 px-3 text-sm"
              disabled={busy}
              onClick={() => onAction(task, 'cancel')}
              type="button"
              variant="secondary"
            >
              取消
            </DsButton>
          ) : null}
          {task.status === 'failed' || task.status === 'timeout' || task.status === 'canceled' ? (
            <DsButton
              className="min-h-9 px-3 text-sm"
              disabled={busy}
              onClick={() => onAction(task, 'retry')}
              type="button"
              variant="secondary"
            >
              重试
            </DsButton>
          ) : null}
          <DsButton
            className="min-h-9 px-3 text-sm"
            disabled={busy}
            onClick={() => onAction(task, 'delete')}
            type="button"
            variant="danger"
          >
            删除
          </DsButton>
          {task.result_assets.length > 0 ? (
            <Link
              className="ds-button ds-button-secondary min-h-9 px-3 text-sm"
              href="/studio/assets?kind=result_image"
            >
              结果图
            </Link>
          ) : null}
          <Link
            className="ds-button ds-button-secondary min-h-9 px-3 text-sm"
            href={{
              pathname: '/studio/tasks/[task_id]',
              query: {
                task_id: task.id,
              },
            }}
          >
            详情
          </Link>
        </div>
      </div>

      <div className="grid gap-3">
        {task.result_assets.length === 0 ? (
          <div className="grid aspect-[4/3] place-items-center rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 text-sm font-semibold text-[var(--ds-muted)]">
            暂无结果图
          </div>
        ) : (
          task.result_assets.slice(0, 2).map((asset) => (
            <a
              className="block aspect-[4/3] rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 p-2"
              href={asset.download_url}
              key={asset.id}
            >
              <img
                alt={asset.filename}
                className="h-full w-full object-contain"
                src={asset.download_url}
              />
            </a>
          ))
        )}
      </div>
    </article>
  );
}

export default function StudioTasksPage() {
  return (
    <RouteGuard requireNewApiConfig>
      <StudioTasksContent />
    </RouteGuard>
  );
}
