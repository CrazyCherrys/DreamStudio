import { NewApiConfigForm } from '@/components/new-api-config-form';
import { ConsoleLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';

export default function ConsoleNewApiPage() {
  return (
    <RouteGuard>
      <ConsoleLayout>
        <section className="ds-card admin-panel p-6">
          <span className="ds-badge">new-api</span>
          <h2 className="mt-4 text-2xl font-black">服务密钥</h2>
          <p className="ds-muted mt-2">管理个人 new-api 密钥、Base URL 和连接测试。</p>
        </section>
        <NewApiConfigForm mode="settings" />
      </ConsoleLayout>
    </RouteGuard>
  );
}
