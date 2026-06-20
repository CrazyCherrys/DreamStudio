import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function DsButton({
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variantClass =
    variant === 'secondary'
      ? 'ds-button-secondary'
      : variant === 'danger'
        ? 'ds-button-danger'
        : '';

  return <button className={`ds-button ${variantClass} ${className}`.trim()} {...props} />;
}

export function DsInput({
  className = '',
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      <span>{label}</span>
      <input
        className={`ds-input ${error ? 'border-[var(--ds-danger)]' : ''} ${className}`.trim()}
        {...props}
      />
      {error ? (
        <span className="text-xs font-semibold text-[var(--ds-danger)]">{error}</span>
      ) : null}
    </label>
  );
}

export function DsFormSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="ds-card p-6">
      <h2 className="text-xl font-black">{title}</h2>
      {description ? <p className="ds-muted mt-2 text-sm leading-6">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
