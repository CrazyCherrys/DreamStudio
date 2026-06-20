import type { NextConfig } from 'next';

const apiBaseUrl = process.env.API_BASE_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBaseUrl}/api/v1/:path*`,
      },
      {
        source: '/healthz',
        destination: `${apiBaseUrl}/healthz`,
      },
      {
        source: '/readyz',
        destination: `${apiBaseUrl}/readyz`,
      },
    ];
  },
};

export default nextConfig;
