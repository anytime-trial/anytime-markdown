//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');

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
    // typescript は実行時に node_modules から読み込む（バンドルに含めると巨大になる）
    typescript: 'commonjs typescript',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](graph-core|vscode-common))/,
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
  devtool: 'nosources-source-map',
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  mode: 'none',
  entry: {
    webview: './src/webview/index.tsx',
    layoutWorker: '../cooccurrence-viewer/src/worker/layoutWorker.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](graph-core|cooccurrence-viewer|vscode-common))/,
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
  ],
  devtool: 'nosources-source-map',
};

/**
 * 拡張へ同梱する mcp-graph サーバー。Node の子プロセスとして起動され vscode API は
 * 参照しない。`dist/mcp-graph-server.js` を生成し、MCP provider / .mcp.json から起動する。
 * @type WebpackConfig
 */
const mcpGraphServerConfig = {
  target: 'node',
  mode: 'none',
  entry: '../mcp-graph/src/stdio.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcp-graph-server.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // mcp-graph は ESM 規約で import 文に .js 拡張子を含む（'./server.js' 等）。
    extensionAlias: { '.js': ['.ts', '.js'] },
    alias: {
      // worktree の node_modules symlink が main checkout を指すため、当該 worktree の
      // graph-core を直接解決する。
      //
      // alias は package.json の exports を迂回する。張り漏れた subpath はエラーに
      // ならず node_modules 側（別チェックアウトのことがある）へ静かに解決され、
      // 「ビルドは通るが取り込まれたソースが別ツリー」という発見の遅い壊れ方をする。
      // そのため graph-core の exports 全 subpath を漏れなく張る。
      // **graph-core の exports を変更したらここも更新すること。**
      '@anytime-markdown/graph-core/types': path.resolve(__dirname, '../graph-core/src/types.ts'),
      '@anytime-markdown/graph-core/engine': path.resolve(__dirname, '../graph-core/src/engine/index.ts'),
      '@anytime-markdown/graph-core/state': path.resolve(__dirname, '../graph-core/src/state/index.ts'),
      '@anytime-markdown/graph-core/viewer': path.resolve(__dirname, '../graph-core/src/viewer/index.ts'),
      '@anytime-markdown/graph-core/element': path.resolve(__dirname, '../graph-core/src/element.ts'),
      '@anytime-markdown/graph-core/src': path.resolve(__dirname, '../graph-core/src'),
      '@anytime-markdown/graph-core$': path.resolve(__dirname, '../graph-core/src/index.ts'),
    },
  },
  module: {
    rules: [
      {
        // mcp-graph 本体（node_modules 外の sibling src）を取り込む。
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown)/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // クロスパッケージ取り込みで拡張の rootDir 制約 (TS6059) を踏まないよう
              // mcp-graph 側 tsconfig を使い、型診断は各パッケージ側 (jest/tsc) に委ねる。
              configFile: path.resolve(__dirname, '../mcp-graph/tsconfig.json'),
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

module.exports = [extensionConfig, webviewConfig, mcpGraphServerConfig];
