//@ts-check
'use strict';

const path = require('path');

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
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](agent-core|llm-core|ollama-core|vscode-common|section-lock-core))/,
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
  devtool: 'nosources-source-map',
};

module.exports = extensionConfig;
