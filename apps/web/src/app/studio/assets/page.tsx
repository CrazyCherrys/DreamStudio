import type { Route } from 'next';
import { redirect } from 'next/navigation';

export default async function StudioAssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  redirect(
    (kind === 'reference_image' ? '/console/assets?kind=reference_image' : '/console/assets') as Route,
  );
}
