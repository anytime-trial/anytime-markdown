//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    vscode: 'commonjs vscode',
    'better-sqlite3': 'commonjs better-sqlite3',
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](database-core|spreadsheet-core|spreadsheet-viewer|trail-db|trail-core|graph-core))/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              allowTsInNodeModules: true,
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  plugins: [
    // dist/node_modules/<pkg> に native binary を含む依存ツリーを丸ごと配置する。
    // Node の標準解決で require('better-sqlite3') が dist/node_modules/better-sqlite3 に
    // hit するため、NODE_PATH の手当ては不要。
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, '../../node_modules/better-sqlite3'),
          to: path.resolve(__dirname, 'dist/node_modules/better-sqlite3'),
          globOptions: { ignore: ['**/src/**', '**/deps/**', '**/binding.gyp'] },
        },
        {
          from: path.resolve(__dirname, '../../node_modules/bindings'),
          to: path.resolve(__dirname, 'dist/node_modules/bindings'),
        },
        {
          from: path.resolve(__dirname, '../../node_modules/file-uri-to-path'),
          to: path.resolve(__dirname, 'dist/node_modules/file-uri-to-path'),
        },
        // trail-db (Trail Database panel) が sql.js を使うため、WASM 版 + .wasm を dist/ にコピー
        // (asm.js は 16MB ヒープ固定で大規模リポジトリの code graph 保存時に OOM するため)。
        {
          from: path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.js'),
          to: 'sql-wasm.js',
        },
        {
          from: path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
          to: 'sql-wasm.wasm',
        },
      ],
    }),
  ],
  devtool: 'nosources-source-map',
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  mode: 'none',
  entry: './src/webview/main.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    alias: {
      'next-intl': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      'next-intl/server': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      // exclude Node-only adapter from web bundle; webview uses RemoteDatabaseAdapter only
      [path.resolve(__dirname, '../database-core/src/BetterSqlite3Adapter.ts')]: false,
      [path.resolve(__dirname, '../database-core/src/SqlJsAdapter.ts')]: false,
    },
    fallback: {
      fs: false,
      path: false,
      crypto: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](database-core|database-viewer|spreadsheet-core|spreadsheet-viewer|vscode-common))/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.webview.json',
              allowTsInNodeModules: true,
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new webpack.IgnorePlugin({
      resourceRegExp: /^better-sqlite3$/,
    }),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, webviewConfig];
