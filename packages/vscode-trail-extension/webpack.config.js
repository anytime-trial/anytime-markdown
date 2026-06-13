//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/**
 * trail-server のソースを束ねる Node バンドル用の ts-loader rule。
 * cross-package ソースを repo-root rootDir でトランスパイルするため、
 * trail-server が持つ共有 tsconfig.bundle.json を参照する（mcp-trail-server /
 * analyze-child / trail-daemon の 3 バンドルで共通）。
 */
const nodeBundleTsLoaderRule = {
  loader: 'ts-loader',
  options: {
    configFile: path.resolve(__dirname, '../trail-server/tsconfig.bundle.json'),
    onlyCompileBundledFiles: true,
    allowTsInNodeModules: true,
    transpileOnly: true,
  },
};

/**
 * ANALYZE=1 のときに webpack-bundle-analyzer の static report を生成する plugin を返す。
 * 通常ビルドでは空配列を返し、bundle に影響しない。
 * 出力: dist/bundle-report-{name}.html
 *
 * @param {string} reportName レポートファイル名のサフィックス（trailstandalone / extension / mcp-trail）
 * @returns {webpack.WebpackPluginInstance[]}
 */
function buildBundleAnalyzerPlugins(reportName) {
  if (process.env.ANALYZE !== '1') return [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
  return [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: `bundle-report-${reportName}.html`,
      openAnalyzer: false,
      generateStatsFile: false,
    }),
  ];
}

// node 系 config 共通: ws / pg のオプショナル native 依存。未インストールでも
// ws は try/catch、pg は pg.native getter 経由でしか参照しないため externals 化で安全
// (実際に require されない config では externals 指定は no-op)。
const OPTIONAL_NATIVE_EXTERNALS = {
  bufferutil: 'commonjs bufferutil',
  'utf-8-validate': 'commonjs utf-8-validate',
  'pg-native': 'commonjs pg-native',
};

// node 系 config 共通の警告抑制。いずれも実害のない動的 require:
// - typescript: compiler 内部の plugin ローダー (本プロジェクトは plugin 機構未使用)。
//   過去 typescript を externalize して回避していたが VSIX 配布では node_modules が
//   同梱されずランタイムで Cannot find module 'typescript' になり拡張が起動しないため、
//   bundle に含めて警告のみ抑制する方針に戻した。
// - PythonParser: bundle 環境では呼び出し側が wasm パスを注入し defaultPythonWasmPath
//   内の require.resolve(<.wasm>) には到達しない。
const NODE_IGNORE_WARNINGS = [
  {
    module: /node_modules[\\/]typescript[\\/]lib[\\/]typescript\.js$/,
    message: /Critical dependency: the request of a dependency is an expression/,
  },
  {
    module: /code-analysis-python[\\/]src[\\/]PythonParser\.ts$/,
    message:
      /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
  },
];

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'development',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    vscode: 'commonjs vscode',
    // ws / pg のオプショナル native 依存 (OPTIONAL_NATIVE_EXTERNALS の定義参照)
    ...OPTIONAL_NATIVE_EXTERNALS,
    // memory-core が require('better-sqlite3') を呼ぶ。webpack に取り込ませると
    // 内部の bindings ロジックが壊れて native binary を解決できないため、
    // ランタイムで Node の require に解決させる。dist/node_modules/ に native
    // binary 付きで配置するため CopyPlugin で同梱する。
    'better-sqlite3': 'commonjs better-sqlite3',
    bindings: 'commonjs bindings',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // tsconfig が NodeNext / Node16 のため import 側に `.js` 拡張子を付ける必要があり
    // (例: `await import('./computeAndPersistFileAnalysis.js')`)、実体が `.ts` のときに
    // webpack が解決できず「Cannot find module」を埋め込むのを防ぐ。
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  ignoreWarnings: NODE_IGNORE_WARNINGS,
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/]trail-core)/,
        use: [{
          loader: 'ts-loader',
          options: {
            allowTsInNodeModules: true,
            transpileOnly: true,
          },
        }],
      },
    ],
  },
  plugins: [
    // VS Code extension host exposes a throwing navigator getter in Node.
    // Supabase's environment detection must see navigator as absent.
    new webpack.DefinePlugin({
      navigator: 'undefined',
    }),
    new CopyPlugin({
      // memory-core / trail-db / mcp-trail はいずれも better-sqlite3 一本化済 (sql.js 撤去後)。
      // memory-core の migrations/*.sql は runner が path.join(__dirname, file)
      // で読むため、webpack バンドル後の dist/ 直下にコピーする。
      // better-sqlite3 とその依存 (bindings / file-uri-to-path) は memory-core が
      // require('better-sqlite3') する際に native binary 付きで解決できるよう
      // dist/node_modules/ に丸ごとコピーする (vscode-database-extension と同じパターン)。
      patterns: [
        {
          // win32 では path.resolve が backslash を返し CopyPlugin の glob が
          // 解釈できないため、forward slash に正規化する。
          from: path.resolve(__dirname, '../memory-core/src/db/migrations/*.sql').replace(/\\/g, '/'),
          to: '[name][ext]',
        },
        {
          from: path.resolve(__dirname, '../../node_modules/better-sqlite3'),
          to: path.resolve(__dirname, 'dist/node_modules/better-sqlite3'),
          // ビルド時専用のファイルは dist (= VSIX) に含めない。
          // - .node: ホスト Node 用にビルドされ VS Code Node (v22) と不一致に
          //   なりやすいため除外し、prebuilt-vscode/ から別途上書きコピーする。
          // - deps/ (sqlite amalgamation C ~10MB) / src/ (C++ addon source) /
          //   binding.gyp: ランタイムは lib/ + .node のみ使用するため不要。
          // globOptions.ignore は copy-webpack-plugin v14 で効かないことがあり
          // (deps/ の C ソースが dist へ漏れていた実績あり)、filter() で確実に
          // 除外する。globOptions は first-pass の意図表明として残す。
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
        // tree-sitter wasm（Python コードグラフ解析用）を dist/wasm/ に同梱する。
        {
          from: path.resolve(__dirname, '../../node_modules/tree-sitter-python/tree-sitter-python.wasm'),
          to: 'wasm/[name][ext]',
        },
        {
          from: path.resolve(__dirname, '../../node_modules/web-tree-sitter/web-tree-sitter.wasm'),
          to: 'wasm/[name][ext]',
        },
      ],
    }),
    ...buildBundleAnalyzerPlugins('extension'),
  ],
  devtool: 'nosources-source-map',
};

/** @type WebpackConfig */
const trailStandaloneConfig = {
  target: 'web',
  // ブラウザに WebSocket 経由で配信する Trail Viewer バンドル。React も
  // production ビルドで配信したいので mode を production に固定する
  // (extension.js とは別ターゲット)。
  mode: 'production',
  entry: './src/trail/standalone/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'trailstandalone.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    // trail-viewer の dynamic import に Node16 型解決のため `.js` 拡張子が含まれる
    // (例: `import('./AnalyticsPanel.js')`)。実ファイルは `.tsx` のため
    // extensionAlias で .js → .tsx/.ts/.jsx/.js の順で解決させる。
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    },
    alias: {
      // markdown-core 内部で `@/...` 形式 import (例: `@/hooks/useConfirm`) を
      // ts-loader が解決できるよう markdown-core/src へ alias する。
      '@': path.resolve(__dirname, '../markdown-viewer/src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](?:graph-core|trail-core|trail-viewer|markdown-core|spreadsheet-viewer|spreadsheet-core))/,
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.trail-standalone.json',
            allowTsInNodeModules: true,
            transpileOnly: true,
          },
        }],
      },
      {
        // markdown-core が katex.min.css 等を直接 import するため css-loader を導入。
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        // markdown-core のテンプレート md (defaultContent.ts 等) を raw text として読み込む。
        test: /\.md$/,
        type: 'asset/source',
      },
    ],
  },
  plugins: [
    // process.env.NODE_ENV は webpack の mode から自動設定されるため明示不要
    new webpack.DefinePlugin({
      'process.env.NEXT_PUBLIC_SHOW_UNLIMITED': JSON.stringify('1'),
    }),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new webpack.NormalModuleReplacementPlugin(/^node:path$/, require.resolve('./src/shims/empty.js')),
    // Trail Viewer では markdown-core のグラフ機能 (jsxgraph / plotly) を使わない。
    // 重量級ライブラリを empty module で置換してバンドルサイズを抑える。
    new webpack.NormalModuleReplacementPlugin(/^jsxgraph$/, require.resolve('./src/shims/empty.js')),
    new webpack.NormalModuleReplacementPlugin(/^plotly\.js-gl3d-dist-min$/, require.resolve('./src/shims/empty.js')),
    ...buildBundleAnalyzerPlugins('trailstandalone'),
  ],
  // 単発で配信する Trail Viewer バンドル。code splitting の対象ではないため
  // webpack デフォルトの 244 KiB 閾値による perf hint は無効化する。
  performance: { hints: false },
  devtool: 'nosources-source-map',
};

/** @type WebpackConfig */
const mcpTrailServerConfig = {
  target: 'node',
  mode: 'development',
  entry: '../trail-server/src/server/mcp-trail-entry.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcp-trail-server.js',
    libraryTarget: 'commonjs2',
  },
  // mcp-trail サーバーは Node プロセスとして子プロセス起動するため
  // vscode API を参照しない。better-sqlite3 はネイティブモジュールなので
  // webpack に取り込まず、runtime に `require('better-sqlite3')` で
  // dist/node_modules/better-sqlite3 を解決する (CopyPlugin で配置済み)。
  externals: {
    ...OPTIONAL_NATIVE_EXTERNALS,
    'better-sqlite3': 'commonjs better-sqlite3',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // mcp-trail は ESM 規約 (NodeNext) で書かれており import 文に .js 拡張子が
    // 含まれる ('./client.js' 等)。webpack に対して .js を .ts として解決する
    // よう extensionAlias で指示する。
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/]mcp-trail)/,
        use: [nodeBundleTsLoaderRule],
      },
    ],
  },
  // __dirname / __filename を runtime 値のまま残す。
  // better-sqlite3 の native binary 解決 (dist/node_modules/better-sqlite3) と
  // memory-core の migrations/*.sql 読み込みのために必要。
  node: {
    __dirname: false,
    __filename: false,
  },
  ignoreWarnings: NODE_IGNORE_WARNINGS,
  plugins: [
    ...buildBundleAnalyzerPlugins('mcp-trail'),
  ],
  devtool: 'nosources-source-map',
};

/**
 * 解析子プロセス (analyze-child.js)。重い TS 解析を別 OS プロセスで実行し、
 * SIGSEGV をホストから隔離する。計算専用で DB を持たないが、万一の transitive
 * 依存に備え better-sqlite3 は externals 化する (dist/node_modules で解決)。
 * @type WebpackConfig
 */
const analyzeChildConfig = {
  target: 'node',
  mode: 'development',
  entry: '../trail-server/src/analyze/analyzeChildEntry.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'analyze-child.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    ...OPTIONAL_NATIVE_EXTERNALS,
    'better-sqlite3': 'commonjs better-sqlite3',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/])/,
        use: [nodeBundleTsLoaderRule],
      },
    ],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  ignoreWarnings: NODE_IGNORE_WARNINGS,
  plugins: [
    ...buildBundleAnalyzerPlugins('analyze-child'),
  ],
  devtool: 'nosources-source-map',
};

/**
 * trail-daemon (trail-daemon.js)。MemoryCoreService + AnalyzeAllRunner を内部で
 * wire する長寿命 child process。extension は IPC client (TrailDaemonHost +
 * AnalyzeAllRunnerClient) でこの daemon を操作し、extension.js から typescript
 * を完全除去する設計 (plan: 20260528-trail-daemon-process-isolation)。
 * @type WebpackConfig
 */
const trailDaemonConfig = {
  target: 'node',
  mode: 'development',
  entry: '../trail-server/src/daemon/trailDaemonEntry.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'trail-daemon.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    ...OPTIONAL_NATIVE_EXTERNALS,
    'better-sqlite3': 'commonjs better-sqlite3',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/])/,
        use: [nodeBundleTsLoaderRule],
      },
    ],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  ignoreWarnings: NODE_IGNORE_WARNINGS,
  plugins: [
    ...buildBundleAnalyzerPlugins('trail-daemon'),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, trailStandaloneConfig, mcpTrailServerConfig, analyzeChildConfig, trailDaemonConfig];

// マルチ config を逐次ビルドし、ピークメモリと同時 V8 JIT 負荷を抑える。
// analyze-child 追加で typescript バンドルが 1 つ増えたため、並列ビルドの
// ピークが Node24/WSL の非決定的 SIGSEGV を誘発しやすくなる。逐次化で緩和する。
module.exports.parallelism = 1;
