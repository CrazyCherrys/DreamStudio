'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { ApiClientError } from '@/lib/auth';
import {
  fetchRequestLog,
  formatDateTime,
  revealRequestLogParams,
  revealRequestLogPrompt,
  statusLabel,
  stringifyPreview,
  type RequestLogDetail,
} from '@/lib/admin';

function AdminRequestLogDetailContent() {
  const params = useParams<{ log_id: string }>();
  const { csrfToken } = useAuth();
  const [detail, setDetail] = useState<RequestLogDetail['item'] | null>(null);
  const [revealed, setRevealed] = useState<{ title: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState(false);

  async function loadLog() {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchRequestLog(params.log_id);
      setDetail(payload.item);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取请求日志失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLog();
  }, [params.log_id]);

  async function reveal(kind: 'prompt' | 'params') {
    if (!csrfToken || !detail) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    const confirmed = window.confirm('查看敏感内容会写入审计日志。确认继续？');
    if (!confirmed) {
      return;
    }

    setRevealing(true);
    setError(null);
    try {
      if (kind === 'prompt') {
        const payload = await revealRequestLogPrompt(detail.id, csrfToken);
        setRevealed({ title: '完整 Prompt', content: payload.prompt });
      } else {
        const payload = await revealRequestLogParams(detail.id, csrfToken);
        setRevealed({ title: '完整参数', content: stringifyPreview(payload.params) });
      }
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'Reveal 失败');
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="text-sm font-black text-[var(--ds-brand)]"
          href={'/admin/request-logs' as Route}
        >
          返回请求日志
        </Link>
        <DsButton disabled={loading} onClick={loadLog} type="button" variant="secondary">
          刷新
        </DsButton>
      </div>

      {loading ? <p className="ds-muted font-semibold">正在读取请求日志详情...</p> : null}
      {error ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}

      {detail ? (
        <>
          <section className="ds-card admin-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="ds-badge">Request Log</span>
                <h2 className="mt-4 break-all text-2xl font-black">{detail.model_id}</h2>
                <p className="ds-muted mt-2">
                  {detail.user?.username ?? '未知用户'} · {detail.endpoint_type} ·{' '}
                  {detail.new_api_base_url_host}
                </p>
              </div>
              <span className="font-black">{statusLabel(detail.status)}</span>
            </div>
            <dl className="mt-6 grid gap-4 md:grid-cols-3">
              <Info label="HTTP 状态" value={String(detail.http_status ?? '无')} />
              <Info label="耗时" value={`${detail.duration_ms ?? 0}ms`} />
              <Info label="创建时间" value={formatDateTime(detail.created_at)} />
              <Info label="Adapter" value={detail.adapter_key ?? '未记录'} />
              <Info label="Adapter 版本" value={detail.adapter_version ?? '未记录'} />
              <Info label="Profile ID" value={detail.execution_profile_id ?? '未记录'} />
              <Info
                label="Profile Revision"
                value={detail.execution_profile_revision_id ?? '未记录'}
              />
              <Info label="任务 ID" value={detail.task?.id ?? '无'} />
              <Info label="任务状态" value={detail.task?.status ?? '无'} />
              <Info
                label="尝试"
                value={detail.attempt ? `第 ${detail.attempt.attempt_no} 次` : '无'}
              />
            </dl>
            {detail.profile_error_hint ? (
              <p className="mt-5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] p-3 text-sm font-semibold text-[var(--ds-danger)]">
                {detail.profile_error_hint}
              </p>
            ) : null}
            {detail.error_message ? (
              <p className="mt-5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] p-3 text-sm font-semibold text-[var(--ds-danger)]">
                {detail.error_message}
              </p>
            ) : null}
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="ds-card admin-panel p-6">
              <h3 className="text-xl font-black">Prompt 摘要</h3>
              <p className="mt-4 whitespace-pre-wrap break-words rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-4 text-sm">
                {detail.prompt_summary ?? '无 Prompt 摘要'}
              </p>
            </div>
            <div className="ds-card admin-panel p-6">
              <h3 className="text-xl font-black">脱敏参数</h3>
              <pre className="mt-4 max-h-96 overflow-auto rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-4 text-xs">
                {stringifyPreview(detail.sanitized_params)}
              </pre>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="ds-card admin-panel p-6">
              <h3 className="text-xl font-black">脱敏上游请求</h3>
              <pre className="mt-4 max-h-96 overflow-auto rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-4 text-xs">
                {stringifyPreview(detail.resolved_request_sanitized)}
              </pre>
            </div>
            <div className="ds-card admin-panel p-6">
              <h3 className="text-xl font-black">上游响应摘要</h3>
              <pre className="mt-4 max-h-96 overflow-auto rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-4 text-xs">
                {stringifyPreview(detail.upstream_response_summary)}
              </pre>
            </div>
          </section>

          <section className="ds-card admin-panel p-6">
            <span className="ds-badge">Sensitive</span>
            <h3 className="mt-4 text-xl font-black">敏感内容 Reveal</h3>
            <p className="ds-muted mt-2 text-sm font-semibold">查看敏感内容会写入审计日志。</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <DsButton
                disabled={revealing || !detail.has_prompt}
                onClick={() => void reveal('prompt')}
                type="button"
                variant="danger"
              >
                Reveal Prompt
              </DsButton>
              <DsButton
                disabled={revealing || !detail.has_params}
                onClick={() => void reveal('params')}
                type="button"
                variant="danger"
              >
                Reveal 参数
              </DsButton>
              {revealed ? (
                <DsButton onClick={() => setRevealed(null)} type="button" variant="secondary">
                  关闭敏感内容
                </DsButton>
              ) : null}
            </div>
            {revealed ? (
              <div className="mt-5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <strong>{revealed.title}</strong>
                  <span className="text-sm font-semibold text-[var(--ds-danger)]">
                    仅当前页面临时展示
                  </span>
                </div>
                <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                  {revealed.content}
                </pre>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="ds-muted text-sm font-semibold">{label}</dt>
      <dd className="mt-1 break-all font-black">{value}</dd>
    </div>
  );
}

export default function AdminRequestLogDetailPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminRequestLogDetailContent />
      </AdminLayout>
    </RouteGuard>
  );
}
