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
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, '../editor-core/src'),
    };
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
