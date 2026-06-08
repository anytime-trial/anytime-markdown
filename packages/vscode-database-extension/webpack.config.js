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
    // VS Code extension host exposes a throwing navigator getter in Node.
    // Supabase's environment detection must see navigator as absent.
    new webpack.DefinePlugin({
      navigator: 'undefined',
    }),
    // dist/node_modules/<pkg> に native binary を含む依存ツリーを丸ごと配置する。
    // Node の標準解決で require('better-sqlite3') が dist/node_modules/better-sqlite3 に
    // hit するため、NODE_PATH の手当ては不要。
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, '../../node_modules/better-sqlite3'),
          to: path.resolve(__dirname, 'dist/node_modules/better-sqlite3'),
          // ビルド時専用のファイルは dist (= VSIX) に含めない。
          // - .node: ホスト Node 用にビルドされ VS Code Node (v24) と不一致に
          //   なりやすいため除外し、prebuilt-vscode/ から別途上書きコピーする。
          // - deps/ (sqlite amalgamation C) / src/ (C++ addon source) /
          //   binding.gyp: ランタイムは lib/ + .node のみ使用するため不要。
          // globOptions.ignore は copy-webpack-plugin v14 で効かないことがあるため
          // filter() で確実に除外する (vscode-trail-extension と同方式)。
          globOptions: { ignore: ['**/src/**', '**/deps/**', '**/binding.gyp'] },
          filter: (resourcePath) => {
            const p = resourcePath.replace(/\\/g, '/');
            if (p.endsWith('.node')) return false;
            if (p.includes('/deps/')) return false;
            if (p.includes('/src/')) return false;
            if (p.endsWith('/binding.gyp')) return false;
            return true;
          },
        },
        {
          // VS Code Node (v24 / ABI 137) 向けにダウンロードした prebuilt を上書き配置する。
          // prepare-native-binding.cjs が prebuilt-vscode/ に用意する。
          from: path.resolve(__dirname, 'prebuilt-vscode/better_sqlite3.node'),
          to: path.resolve(__dirname, 'dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node'),
          force: true,
        },
        {
          from: path.resolve(__dirname, '../../node_modules/bindings'),
          to: path.resolve(__dirname, 'dist/node_modules/bindings'),
        },
        {
          from: path.resolve(__dirname, '../../node_modules/file-uri-to-path'),
          to: path.resolve(__dirname, 'dist/node_modules/file-uri-to-path'),
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
