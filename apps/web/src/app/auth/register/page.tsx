import { AuthForm } from '@/components/auth-form';
import { AuthLayout } from '@/components/layouts';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = typeof params.next === 'string' ? params.next : params.next?.[0];

  return (
    <AuthLayout>
      <AuthForm mode="register" nextPath={nextPath} />
    </AuthLayout>
  );
}
