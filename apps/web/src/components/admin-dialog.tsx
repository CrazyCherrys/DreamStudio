'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

import { DsButton } from '@/components/ui';

export function AdminDialog({
  badge,
  children,
  description,
  disabled = false,
  maxWidthClass = 'max-w-2xl',
  onClose,
  title,
}: {
  badge?: string;
  children: React.ReactNode;
  description?: string;
  disabled?: boolean;
  maxWidthClass?: string;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !disabled) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onClose]);

  return (
    <div
      aria-labelledby="admin-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disabled) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div
        className={`ds-card mx-auto flex max-h-[calc(100vh-48px)] w-full ${maxWidthClass} flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--ds-border)] p-5">
          <div>
            {badge ? <span className="ds-badge">{badge}</span> : null}
            <h2
              className={badge ? 'mt-3 text-2xl font-black' : 'text-2xl font-black'}
              id="admin-dialog-title"
            >
              {title}
            </h2>
            {description ? <p className="ds-muted mt-2 text-sm leading-6">{description}</p> : null}
          </div>
          <button
            aria-label="关闭弹窗"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] text-[var(--ds-text)] transition hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-surface)]"
            disabled={disabled}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function AdminConfirmDialog({
  cancelLabel = '取消',
  confirmLabel,
  description,
  disabled = false,
  error,
  onCancel,
  onConfirm,
  title,
  variant = 'danger',
}: {
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  disabled?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  variant?: 'danger' | 'primary';
}) {
  return (
    <AdminDialog
      badge="Confirm"
      disabled={disabled}
      maxWidthClass="max-w-lg"
      onClose={onCancel}
      title={title}
    >
      <p className="ds-muted text-sm leading-6">{description}</p>
      {error ? (
        <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <DsButton disabled={disabled} onClick={onCancel} type="button" variant="secondary">
          {cancelLabel}
        </DsButton>
        <DsButton
          disabled={disabled}
          onClick={onConfirm}
          type="button"
          variant={variant === 'danger' ? 'danger' : 'primary'}
        >
          {confirmLabel}
        </DsButton>
      </div>
    </AdminDialog>
  );
}
