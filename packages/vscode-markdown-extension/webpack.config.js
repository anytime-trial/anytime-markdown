//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
// @tiptap/* → vendored ソースへの alias（共有ヘルパ）
const { buildWebpackAlias } = require('../tiptap-vendor/alias.cjs');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // TypeScript Node16 mode uses .js extensions in imports; resolve them as .ts first.
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  mode: 'none',

  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    alias: {
      // @tiptap/* → vendored ソース
      ...buildWebpackAlias(),
      'next-intl': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      'next-intl/server': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      'next/dynamic': path.resolve(__dirname, 'src/webview/shims/next-dynamic.ts'),
      '@': path.resolve(__dirname, '../markdown-viewer/src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules[\\/](?!@anytime-markdown)/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.webview.json',
              allowTsInNodeModules: true,
              // tiptap-vendor は第三者 vendored ソース（tiptap 自前のゆるい設定でビルドされ
              // strict 下では implicitNoAny 等が出る）。app コード(markdown-core/rich)のみ型診断する。
              reportFiles: ['**/*.{ts,tsx}', '!**/tiptap-vendor/**', '!**/node_modules/**'],
            },
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.md$/,
        type: 'asset/source',
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
    // VS Code webview cannot load dynamic chunks (CSP nonce + webview URI issues).
    // Force everything into a single bundle file.
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    // Exclude heavy graph libraries from webview bundle (hideGraph disables the UI).
    new webpack.NormalModuleReplacementPlugin(/^jsxgraph$/, require.resolve('./src/webview/shims/empty-module.ts')),
    new webpack.NormalModuleReplacementPlugin(/^plotly\.js-gl3d-dist-min$/, require.resolve('./src/webview/shims/empty-module.ts')),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, webviewConfig];
