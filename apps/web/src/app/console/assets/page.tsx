import { ConsoleAssetsContent } from '@/components/console/assets-content';
import { ConsoleLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import type { AssetKind } from '@/lib/assets';

function normalizeKind(value: string | undefined): AssetKind {
  return value === 'reference_image' ? 'reference_image' : 'result_image';
}

export default async function ConsoleAssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kindValue = Array.isArray(params.kind) ? params.kind[0] : params.kind;

  return (
    <RouteGuard requireNewApiConfig>
      <ConsoleLayout>
        <ConsoleAssetsContent initialKind={normalizeKind(kindValue)} />
      </ConsoleLayout>
    </RouteGuard>
  );
}
