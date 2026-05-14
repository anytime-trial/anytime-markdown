//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

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
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    // trail-db が require('better-sqlite3') する。webpack に取り込ませると
    // native binary を解決できないため、runtime で require に解決させる。
    'better-sqlite3': 'commonjs better-sqlite3',
    bindings: 'commonjs bindings',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](?:trail-db|trail-core))/,
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
      // better-sqlite3 とその native binary 依存を dist/node_modules/ にコピーする。
      // trail-db が require('better-sqlite3') する際に、bundled JS と同階層の
      // node_modules から native binary を解決できるようにする
      // (vscode-trail-extension / vscode-database-extension と同じパターン)。
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
      ],
    }),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig];
