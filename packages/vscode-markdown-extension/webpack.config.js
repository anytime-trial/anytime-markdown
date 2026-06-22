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
      // graph-core / ui-core はワークスペース src を直接解決する（worktree の node_modules
      // symlink が main checkout を指すため、alias で当該 worktree の src に固定）。
      // バレル（完全一致）は index.ts、サブパス（./src/* 等）は src ディレクトリへ。
      '@anytime-markdown/graph-core$': path.resolve(__dirname, '../graph-core/src/index.ts'),
      '@anytime-markdown/graph-core': path.resolve(__dirname, '../graph-core/src'),
      '@anytime-markdown/ui-core$': path.resolve(__dirname, '../ui-core/src/index.ts'),
      '@anytime-markdown/ui-core': path.resolve(__dirname, '../ui-core/src'),
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
 * 拡張へ同梱する mcp-markdown サーバー。Node の子プロセスとして起動され vscode API は
 * 参照しない。`dist/mcp-markdown-server.js` を生成し、MCP provider / .mcp.json から起動する。
 * @type WebpackConfig
 */
const mcpMarkdownServerConfig = {
  target: 'node',
  mode: 'none',
  entry: '../mcp-markdown/src/stdio.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcp-markdown-server.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    // jsdom / ws が optional に require する native/任意モジュール。mcp-markdown は
    // これらの機能を使わないため外部化し、バンドルから除外する（runtime に未解決でも
    // jsdom 側 try/catch で握り潰される）。
    canvas: 'commonjs canvas',
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    // doc-core 検索が使う Node 組み込み SQLite。実行時 require する。
    'node:sqlite': 'commonjs node:sqlite',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // mcp-markdown は ESM 規約で import 文に .js 拡張子を含む（'./server.js' 等）。
    extensionAlias: { '.js': ['.ts', '.js'] },
    alias: {
      // worktree の node_modules symlink が main checkout を指す問題を避け、
      // 当該 worktree の src を直接解決する。
      ...buildWebpackAlias(),
      '@anytime-markdown/markdown-engine': path.resolve(__dirname, '../markdown-engine/src/index.ts'),
      '@anytime-markdown/doc-core': path.resolve(__dirname, '../doc-core/src/index.ts'),
    },
  },
  module: {
    rules: [
      {
        // mcp-markdown 本体（node_modules 外の sibling src）を取り込む。
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown)/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // クロスパッケージ取り込みで拡張の rootDir 制約 (TS6059) を踏まないよう
              // mcp-markdown 側 tsconfig を使い、型診断は各パッケージ側 (jest/tsc) に委ねる。
              configFile: path.resolve(__dirname, '../mcp-markdown/tsconfig.json'),
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  devtool: 'nosources-source-map',
};

/**
 * doc-core ingest を行う node 子プロセス（拡張ホストから spawn）。`dist/doc-ingest.js` を生成。
 * doc-core（node:sqlite 利用）を取り込むのはこのバンドルのみ。native module 不要。
 * @type WebpackConfig
 */
const docIngestServerConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/docCore/ingestEntry.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'doc-ingest.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    // Node 組み込み SQLite。バンドルに取り込まず実行時 require する。
    'node:sqlite': 'commonjs node:sqlite',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: { '.js': ['.ts', '.js'] },
    alias: {
      // worktree の node_modules symlink 経由を避け、当該 worktree の doc-core src を直接解決。
      '@anytime-markdown/doc-core': path.resolve(__dirname, '../doc-core/src/index.ts'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown)/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // doc-core（rootDir 制約のない tsconfig）を取り込むため doc-core 側 tsconfig を使い、
              // 型診断はスキップ（型は doc-core / 拡張の tsc が担保）。
              configFile: path.resolve(__dirname, '../doc-core/tsconfig.json'),
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, webviewConfig, mcpMarkdownServerConfig, docIngestServerConfig];
