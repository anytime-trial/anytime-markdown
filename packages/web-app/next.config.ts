import type { NextConfig } from 'next';
import withBundleAnalyzerInit from '@next/bundle-analyzer';
import withSerwistInit from '@serwist/next';
import createNextIntlPlugin from 'next-intl/plugin';
// @anytime-markdown/markdown-* → vendored ソースへの alias（共有ヘルパ）。webpack=next build 用 / Turbopack=dev 用。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildWebpackAlias, buildTurbopackAlias } = require('../markdown-core/alias.cjs');

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
    '@anytime-markdown/markdown-core',
    '@anytime-markdown/database-core',
    '@anytime-markdown/database-viewer',
    '@anytime-markdown/markdown-viewer',
    '@anytime-markdown/markdown-engine',
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
      // @anytime-markdown/markdown-* → vendored ソース（dev = Turbopack）
      ...buildTurbopackAlias(process.cwd()),
      // markdown-engine（フレームワーク非依存層）は alias.cjs(vendored)外のため明示配線
      '@anytime-markdown/markdown-engine': '../markdown-engine/src/index.ts',
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
    // @anytime-markdown/markdown-* → vendored ソース（next build = webpack）
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      ...buildWebpackAlias(),
      // markdown-engine（フレームワーク非依存層）は alias.cjs(vendored)外のため明示配線
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      '@anytime-markdown/markdown-engine$': require('node:path').resolve(process.cwd(), '../markdown-engine/src/index.ts'),
    };
    // sql.js (WASM) は Node 用 fs/path/crypto API を持つため、ブラウザバンドルでは無効化
    if (!isServer) {
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
