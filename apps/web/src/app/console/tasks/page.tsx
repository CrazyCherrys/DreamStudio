import { ConsoleLayout } from '@/components/layouts';
import { ConsoleTasksContent } from '@/components/console/tasks-content';
import { RouteGuard } from '@/components/route-guard';

export default function ConsoleTasksPage() {
  return (
    <RouteGuard requireNewApiConfig>
      <ConsoleLayout>
        <ConsoleTasksContent />
      </ConsoleLayout>
    </RouteGuard>
  );
}
