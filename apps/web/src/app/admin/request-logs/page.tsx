'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { ApiClientError } from '@/lib/auth';
import {
  fetchRequestLogs,
  formatDateTime,
  statusLabel,
  stringifyPreview,
  type Pagination,
  type RequestLogListItem,
} from '@/lib/admin';

function AdminRequestLogsContent() {
  const [status, setStatus] = useState('');
  const [modelId, setModelId] = useState('');
  const [userId, setUserId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<RequestLogListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: '20',
      });
      if (status) params.set('status', status);
      if (modelId.trim()) params.set('model_id', modelId.trim());
      if (userId.trim()) params.set('user_id', userId.trim());
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const payload = await fetchRequestLogs(params);
      setLogs(payload.items);
      setPagination(payload.pagination);
      setPage(payload.pagination.page);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取请求日志失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(1);
  }, []);

  return (
    <section className="ds-card admin-panel p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <AdminPageHeading title="请求日志" />
      </div>

      <form
        className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          void loadLogs(1);
        }}
      >
        <select
          className="ds-input"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="">全部状态</option>
          <option value="succeeded">成功</option>
          <option value="failed">失败</option>
          <option value="timeout">超时</option>
          <option value="canceled">已取消</option>
        </select>
        <input
          className="ds-input"
          onChange={(event) => setModelId(event.target.value)}
          placeholder="模型 ID"
          value={modelId}
        />
        <input
          className="ds-input"
          onChange={(event) => setUserId(event.target.value)}
          placeholder="用户 UUID"
          value={userId}
        />
        <input
          className="ds-input"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="关键词"
          value={keyword}
        />
        <input
          className="ds-input"
          onChange={(event) => setDateFrom(event.target.value)}
          type="datetime-local"
          value={dateFrom}
        />
        <div className="flex gap-2">
          <input
            className="ds-input"
            onChange={(event) => setDateTo(event.target.value)}
            type="datetime-local"
            value={dateTo}
          />
          <DsButton type="submit">查询</DsButton>
        </div>
      </form>

      {error ? (
        <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {loading ? <p className="ds-muted font-semibold">正在读取请求日志...</p> : null}
        {logs.map((log) => (
          <article
            className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4"
            key={log.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-all text-lg font-black">{log.model_id}</h3>
                <p className="ds-muted mt-1 text-sm">
                  {log.user?.username ?? '未知用户'} · {log.endpoint_type} ·{' '}
                  {log.new_api_base_url_host}
                </p>
                <p className="ds-muted mt-1 text-xs font-semibold">
                  Adapter {log.adapter_key ?? '未记录'} · Profile rev{' '}
                  {log.execution_profile_revision_id ?? '未记录'}
                </p>
              </div>
              <span className="font-black">{statusLabel(log.status)}</span>
            </div>
            {log.profile_error_hint ? (
              <p className="mt-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-3 py-2 text-sm font-semibold text-[var(--ds-danger)]">
                {log.profile_error_hint}
              </p>
            ) : null}
            <p className="mt-3 break-words text-sm font-semibold">
              {log.prompt_summary ?? '无 Prompt 摘要'}
            </p>
            <pre className="mt-3 max-h-32 overflow-auto rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-3 text-xs">
              {stringifyPreview(log.sanitized_params)}
            </pre>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="ds-muted">
                HTTP {log.http_status ?? '无'} · {log.duration_ms ?? 0}ms ·{' '}
                {formatDateTime(log.created_at)}
              </span>
              <Link
                className="font-black text-[var(--ds-brand)]"
                href={`/admin/request-logs/${log.id}` as Route}
              >
                详情
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="ds-muted text-sm font-semibold">
          共 {pagination?.total ?? 0} 条日志，第 {pagination?.page ?? page} /{' '}
          {pagination?.total_pages ?? 1} 页
        </p>
        <div className="flex gap-2">
          <DsButton
            disabled={loading || page <= 1}
            onClick={() => void loadLogs(page - 1)}
            type="button"
            variant="secondary"
          >
            上一页
          </DsButton>
          <DsButton
            disabled={loading || page >= (pagination?.total_pages ?? 1)}
            onClick={() => void loadLogs(page + 1)}
            type="button"
            variant="secondary"
          >
            下一页
          </DsButton>
        </div>
      </div>
    </section>
  );
}

export default function AdminRequestLogsPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminRequestLogsContent />
      </AdminLayout>
    </RouteGuard>
  );
}
