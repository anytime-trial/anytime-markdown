'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

const baseNodeConfig = {
  target: 'node',
  mode: 'development',
  externals: {
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    'better-sqlite3': 'commonjs better-sqlite3',
    bindings: 'commonjs bindings',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/])/,
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.bundle.json'),
            onlyCompileBundledFiles: true,
            allowTsInNodeModules: true,
            transpileOnly: true,
          },
        }],
      },
    ],
  },
  ignoreWarnings: [
    {
      module: /node_modules[\\/]typescript[\\/]lib[\\/]typescript\.js$/,
      message: /Critical dependency: the request of a dependency is an expression/,
    },
  ],
  node: { __dirname: false, __filename: false },
  devtool: 'nosources-source-map',
};

/** @type {import('webpack').Configuration} */
const serverConfig = {
  ...baseNodeConfig,
  entry: './src/cli.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'cli.js',
    libraryTarget: 'commonjs2',
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, '../memory-core/src/db/migrations/*.sql'),
          to: '[name][ext]',
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
        {
          from: path.resolve(__dirname, 'src/viewer-dist'),
          to: 'viewer-dist',
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
};

module.exports = [serverConfig];
