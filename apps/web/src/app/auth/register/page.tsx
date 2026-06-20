import { AuthForm } from '@/components/auth-form';
import { AuthLayout } from '@/components/layouts';

export default function RegisterPage() {
  return (
    <AuthLayout>
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
