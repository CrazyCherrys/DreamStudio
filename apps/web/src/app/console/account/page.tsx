import { AccountSettingsContent } from '@/components/console/account-settings-content';
import { ConsoleLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';

export default function ConsoleAccountPage() {
  return (
    <RouteGuard>
      <ConsoleLayout>
        <AccountSettingsContent />
      </ConsoleLayout>
    </RouteGuard>
  );
}
