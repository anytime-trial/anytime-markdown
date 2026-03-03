const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  transpilePackages: ['@anytime-markdown/editor-core'],
  ...(isCapacitorBuild && {
    output: 'export',
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
          ],
        },
      ];
    },
  }),
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });
    return config;
  },
};

// Capacitor ビルド時は serwist を無効化
if (!isCapacitorBuild) {
  const withSerwist = require('@serwist/next').default({
    swSrc: 'src/app/sw.ts',
    swDest: 'public/sw.js',
  });
  module.exports = withSerwist(withNextIntl(nextConfig));
} else {
  module.exports = withNextIntl(nextConfig);
}
