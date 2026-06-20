import type { Metadata } from 'next';

import { AuthProvider } from '@/components/auth-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'DreamStudio',
  description: 'A browser-based AI image creation studio powered by user-owned new-api keys.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
