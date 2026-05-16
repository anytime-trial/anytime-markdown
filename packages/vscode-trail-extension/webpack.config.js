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
          // build/Release/better_sqlite3.node はホスト Node 用にビルドされる
          // ことが多く VS Code Node (v22) と不一致になる。
          // .node は別途 prebuilt-vscode/ から上書きコピーするため filter で除外する。
          // (globOptions.ignore は copy-webpack-plugin v14 で稀に効かないので
          // filter() による明示判定にする。)
          globOptions: { ignore: ['**/src/**', '**/deps/**', '**/binding.gyp'] },
          filter: (resourcePath) => !resourcePath.endsWith('.node'),
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
  // better-sqlite3 の native binary 解決 (dist/node_modules/better-sqlite3) と
  // memory-core の migrations/*.sql 読み込みのために必要。
  node: {
    __dirname: false,
    __filename: false,
  },
  // memory-core が typescript を import しており、ts compiler の内部プラグイン
  // ローダーが動的 require を使うため警告が出る (extensionConfig と同根)。
  // bundle に含めて警告のみ抑制する。
  ignoreWarnings: [
    {
      module: /node_modules[\\/]typescript[\\/]lib[\\/]typescript\.js$/,
      message: /Critical dependency: the request of a dependency is an expression/,
    },
  ],
  plugins: [
    ...buildBundleAnalyzerPlugins('mcp-trail'),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, trailStandaloneConfig, mcpTrailServerConfig];
