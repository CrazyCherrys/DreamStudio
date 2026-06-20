'use client';

import { NewApiConfigForm } from '@/components/new-api-config-form';
import { RouteGuard } from '@/components/route-guard';

export default function NewApiOnboardingPage() {
  return (
    <RouteGuard>
      <main className="ds-shell min-h-screen py-8">
        <NewApiConfigForm mode="onboarding" />
      </main>
    </RouteGuard>
  );
}
