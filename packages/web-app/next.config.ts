import type { NextConfig } from 'next';
import withBundleAnalyzerInit from '@next/bundle-analyzer';
import withSerwistInit from '@serwist/next';
import createNextIntlPlugin from 'next-intl/plugin';

process.env.SERWIST_SUPPRESS_TURBOPACK_WARNING = '1';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

// Cloudflareでのビルド時は強制的にWebモード（false）にする設定を追加
const isCloudflare = process.env.CF_PAGES === '1';
const isCapacitorBuild = !isCloudflare && process.env.CAPACITOR_BUILD === 'true';

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: [
    '@anytime-markdown/database-core',
    '@anytime-markdown/database-viewer',
    '@anytime-markdown/markdown-core',
    '@anytime-markdown/spreadsheet-core',
    '@anytime-markdown/spreadsheet-viewer',
    '@anytime-markdown/trace-core',
    '@anytime-markdown/trace-viewer',
    '@anytime-markdown/trail-viewer',
  ],
  // sql.js は Node 用 require('fs'/'path'/'crypto') を含むためサーバ側では external 扱い
  serverExternalPackages: ['sql.js'],
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
    resolveAlias: {
      // sql.js (WASM) は Node 用 require('fs'/'path'/'crypto') を含むため
      // ブラウザバンドルでは noop に解決して dead code として除去する
      fs: { browser: './src/lib/sqlJsNoopShim.ts' },
      path: { browser: './src/lib/sqlJsNoopShim.ts' },
      crypto: { browser: './src/lib/sqlJsNoopShim.ts' },
    },
  },
  ...(isCapacitorBuild && {
    output: 'export' as const,
    trailingSlash: true,
  }),
  ...(!isCapacitorBuild && {
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'X-Content-Type-Options',
              value: 'nosniff',
            },
            {
              key: 'X-Frame-Options',
              value: 'DENY',
            },
            {
              key: 'Referrer-Policy',
              value: 'strict-origin-when-cross-origin',
            },
            {
              key: 'Permissions-Policy',
              value: 'camera=(), microphone=(), geolocation=()',
            },
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=31536000; includeSubDomains',
            },
          ],
        },
      ];
    },
  }),
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });
    // sql.js (WASM) は Node 用 fs/path/crypto API を持つため、ブラウザバンドルでは無効化
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

// Capacitor ビルド時は serwist を無効化
let finalConfig: NextConfig;
if (!isCapacitorBuild) {
  const withSerwist = withSerwistInit({
    swSrc: 'src/app/sw.ts',
    swDest: 'public/sw.js',
  });
  finalConfig = withBundleAnalyzer(withSerwist(withNextIntl(nextConfig)));
} else {
  finalConfig = withBundleAnalyzer(withNextIntl(nextConfig));
}

export default finalConfig;
