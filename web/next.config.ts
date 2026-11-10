import type { NextConfig } from 'next';
import { checkBrowserEnv } from '../scripts/check-browser-env.mjs';

const config: NextConfig = {
  allowedDevOrigins: ['*.e2b.app'],
  async rewrites() {
    const origin = process.env.API_ORIGIN;
    return origin
      ? [{ source: '/api/v1/:path*', destination: `${origin.replace(/\/$/, '')}/v1/:path*` }]
      : [];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};
export default async function nextConfig(): Promise<NextConfig> {
  await checkBrowserEnv(process.cwd());
  return config;
}
