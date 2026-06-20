import { AuthForm } from '@/components/auth-form';
import { AuthLayout } from '@/components/layouts';

export default function LoginPage() {
  return (
    <AuthLayout>
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
