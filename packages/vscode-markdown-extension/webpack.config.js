//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
// @anytime-markdown/markdown-* → vendored ソースへの alias（共有ヘルパ）
const { buildWebpackAlias } = require('../markdown-core/alias.cjs');

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
    alias: {
      // 型のみ参照（import type）だが、worktree の node_modules symlink が main checkout を
      // 指すため、当該 worktree の graph-core src へ alias で固定する。
      '@anytime-markdown/graph-core': path.resolve(__dirname, '../graph-core/src/index.ts'),
    },
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

  entry: './src/webview/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    alias: {
      // @anytime-markdown/markdown-* → vendored ソース
      ...buildWebpackAlias(),
      '@': path.resolve(__dirname, '../markdown-viewer/src'),
      '@anytime-markdown/markdown-engine': path.resolve(__dirname, '../markdown-engine/src/index.ts'),
      // graph-core はワークスペース src を直接解決する（worktree の node_modules
      // symlink が main checkout を指すため、alias で当該 worktree の src に固定）。
      '@anytime-markdown/graph-core': path.resolve(__dirname, '../graph-core/src/index.ts'),
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
              // markdown-core は第三者 vendored ソース（tiptap 自前のゆるい設定でビルドされ
              // strict 下では implicitNoAny 等が出る）。app コード(markdown-core/rich)のみ型診断する。
              reportFiles: ['**/*.{ts,tsx}', '!**/markdown-core/**', '!**/node_modules/**'],
            },
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            // *.module.css は CSS Modules、それ以外はグローバル CSS として扱う。
            // css-loader v7 は namedExport が既定 true のため `import styles from "./x.module.css"`
            // が undefined になり `styles.foo` で実行時クラッシュする。default export を復活させ、
            // クラス名はソース表記のまま（as-is）参照できるようにする。
            options: {
              modules: {
                auto: true,
                namedExport: false,
                exportLocalsConvention: 'as-is',
                localIdentName: '[name]__[local]__[hash:base64:5]',
              },
            },
          },
        ],
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

/**
 * ノート網ビューア用の独立 webview バンドル（graph-core 描画のみ・軽量）。
 * markdown エディタ webview と resolve/module/plugins を共有する。
 * @type WebpackConfig
 */
const noteGraphWebviewConfig = {
  ...webviewConfig,
  entry: './src/webview/noteGraph/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'noteGraph.js',
  },
};

module.exports = [extensionConfig, webviewConfig, noteGraphWebviewConfig];
