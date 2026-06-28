import { ConsoleTaskDetailContent } from '@/components/console/task-detail-content';
import { ConsoleLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';

export default async function ConsoleTaskDetailPage({
  params,
}: {
  params: Promise<{ task_id: string }>;
}) {
  const { task_id: taskId } = await params;

  return (
    <RouteGuard requireNewApiConfig>
      <ConsoleLayout>
        <ConsoleTaskDetailContent taskId={taskId} />
      </ConsoleLayout>
    </RouteGuard>
  );
}
