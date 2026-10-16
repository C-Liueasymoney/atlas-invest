import type { NextConfig } from 'next';
import { resolve } from 'node:path';
const config: NextConfig = { output: 'standalone', outputFileTracingRoot: resolve(process.cwd(), '../..'), poweredByHeader: false, async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'same-origin' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; } };
export default config;
