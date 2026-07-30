//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: {
    // VS Code 拡張本体
    extension: './src/extension.ts',
    // agent 拡張が spawn する常駐ワーカー。node:sqlite を import するのはこのバンドルのみ。
    'agent-status-worker': './src/worker/agentStatusWorkerEntry.ts',
    airspace: './src/airspace/airspaceEntry.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](agent-core|llm-core|ollama-core|vscode-common|section-lock-core|tickets-core))/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.json'),
              allowTsInNodeModules: true,
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  devtool: 'nosources-source-map',
};

/**
 * チケットボードの webview バンドル。
 *
 * extension バンドル（target: node）とは分離が必須。webview 側は tickets-viewer の
 * React ツリーを読み込み、extension 側は node:crypto 等の Node 組み込みを使うため、
 * 同一バンドルに混ぜると webview で解決に失敗する。
 *
 * `next-intl` は ESM 専用（package.json の exports に require 条件が無い）で、
 * tickets-viewer のバレル経由で読み込むと解決に失敗するため、自前 shim へ alias する。
 * jest 側（jest.config.js の moduleNameMapper）と tsconfig.test.json の paths にも
 * 同じ対応が要る。3 箇所を同期させること。
 *
 * @type WebpackConfig
 */
const ticketsWebviewConfig = {
  target: 'web',
  mode: 'none',
  entry: { 'tickets-webview': './src/webview/tickets/main.tsx' },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    alias: {
      'next-intl': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      'next-intl/server': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
    },
    fallback: { fs: false, path: false, crypto: false },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude:
          /node_modules[\\/](?!@anytime-markdown[\\/](tickets-core|tickets-viewer|vscode-common))/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.webview.json'),
              allowTsInNodeModules: true,
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('production') }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, ticketsWebviewConfig];
