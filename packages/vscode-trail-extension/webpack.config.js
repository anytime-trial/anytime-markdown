//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

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
    // ws のオプショナルなネイティブ依存を除外（バンドルなしで動作する）
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    // pg のオプションネイティブバインディング (pg-native) は未インストール。
    // pg.native を参照しない限りロードされないため外部化で OK。
    'pg-native': 'commonjs pg-native',
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
  // typescript の内部プラグインローダーが動的 require を使うため
  // 「Critical dependency: the request of a dependency is an expression」警告
  // が出るが、実害なし (typescript 自身の plugin 機構は使っていない)。
  // 過去 typescript を externalize して回避していたが VSIX 配布では node_modules
  // が同梱されないためランタイムで Cannot find module 'typescript' になり拡張が
  // 起動しない。bundle に含めて警告は ignore する方針に戻す。
  ignoreWarnings: [
    {
      module: /node_modules[\\/]typescript[\\/]lib[\\/]typescript\.js$/,
      message: /Critical dependency: the request of a dependency is an expression/,
    },
  ],
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
      // sql-wasm.js は initSqlJs() の locateFile で sql-wasm.wasm を同階層から
      // 読み込むため、両ファイルを dist/ に配置する。asm.js (16MB ヒープ固定)
      // 比で WASM は最大 2GB ヒープを使えるため大規模リポジトリの code graph
      // 保存時の OOM を回避できる。
      patterns: [
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
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](?:graph-core|trail-core|trail-viewer))/,
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.trail-standalone.json',
            allowTsInNodeModules: true,
            transpileOnly: true,
          },
        }],
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
  entry: './src/server/mcp-trail-entry.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcp-trail-server.js',
    libraryTarget: 'commonjs2',
  },
  // mcp-trail サーバーは Node プロセスとして子プロセス起動するため
  // vscode API を参照しない。sql.js は WASM で webpack に取り込むと
  // モジュール解決が壊れるため、ランタイムで __non_webpack_require__ で
  // dist/sql-wasm.js を動的ロードする。webpack で取り込まないように除外する。
  externals: {
    'sql.js': 'commonjs sql.js',
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
  // __dirname / __filename を runtime 値のまま残す。
  // sql.js の locate (sql-wasm.js / sql-wasm.wasm) を dist/ から探すために必要。
  node: {
    __dirname: false,
    __filename: false,
  },
  plugins: [
    ...buildBundleAnalyzerPlugins('mcp-trail'),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, trailStandaloneConfig, mcpTrailServerConfig];
