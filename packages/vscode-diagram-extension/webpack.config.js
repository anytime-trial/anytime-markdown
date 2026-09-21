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
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](diagram-core|vscode-common))/,
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
    webview: './src/webview/index.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](diagram-core|diagram-viewer|ui-core|vscode-common))/,
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
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
  ],
  devtool: 'nosources-source-map',
};

/**
 * 拡張へ同梱する mcp-diagram サーバー。Node の子プロセスとして起動され vscode API は参照しない。
 * `dist/mcp-diagram-server.js` を生成し、MCP provider / .mcp.json から起動する。
 * @type WebpackConfig
 */
const mcpDiagramServerConfig = {
  target: 'node',
  mode: 'none',
  entry: '../mcp-diagram/src/stdio.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcp-diagram-server.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // mcp-diagram は ESM 規約で import 文に .js 拡張子を含む（'./server.js' 等）。
    extensionAlias: { '.js': ['.ts', '.js'] },
    alias: {
      // worktree の node_modules symlink が main checkout を指すため、当該 worktree の
      // diagram-core を直接解決する。
      //
      // alias は package.json の exports を迂回する。張り漏れた subpath はエラーにならず
      // node_modules 側（別チェックアウトのことがある）へ静かに解決され、「ビルドは通るが
      // 取り込まれたソースが別ツリー」という発見の遅い壊れ方をする。そのため diagram-core の
      // exports 全 subpath を漏れなく張る。
      // **diagram-core の exports を変更したらここも更新すること。**
      '@anytime-markdown/diagram-core/document': path.resolve(__dirname, '../diagram-core/src/document.ts'),
      '@anytime-markdown/diagram-core/grid': path.resolve(__dirname, '../diagram-core/src/grid.ts'),
      '@anytime-markdown/diagram-core/layout': path.resolve(__dirname, '../diagram-core/src/layout.ts'),
      '@anytime-markdown/diagram-core/spacing': path.resolve(__dirname, '../diagram-core/src/spacing.ts'),
      '@anytime-markdown/diagram-core/types': path.resolve(__dirname, '../diagram-core/src/types.ts'),
      '@anytime-markdown/diagram-core/view': path.resolve(__dirname, '../diagram-core/src/view.ts'),
      '@anytime-markdown/diagram-core/src': path.resolve(__dirname, '../diagram-core/src'),
      '@anytime-markdown/diagram-core$': path.resolve(__dirname, '../diagram-core/src/index.ts'),
    },
  },
  module: {
    rules: [
      {
        // mcp-diagram 本体（node_modules 外の sibling src）を取り込む。
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown)/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // クロスパッケージ取り込みで拡張の rootDir 制約 (TS6059) を踏まないよう
              // mcp-diagram 側 tsconfig を使い、型診断は各パッケージ側 (jest/tsc) に委ねる。
              configFile: path.resolve(__dirname, '../mcp-diagram/tsconfig.json'),
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

module.exports = [extensionConfig, webviewConfig, mcpDiagramServerConfig];
