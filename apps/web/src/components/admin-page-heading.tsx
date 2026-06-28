import type { ReactNode } from 'react';

interface AdminPageHeadingProps {
  title: string;
  actions?: ReactNode;
}

export function AdminPageHeading({ title, actions }: AdminPageHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <h2 className="text-2xl font-black">{title}</h2>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
