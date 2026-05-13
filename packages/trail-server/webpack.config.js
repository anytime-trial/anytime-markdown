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
    'sql.js': 'commonjs sql.js',
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
          options: { allowTsInNodeModules: true, transpileOnly: true },
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
          from: path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.js'),
          to: 'sql-wasm.js',
        },
        {
          from: path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
          to: 'sql-wasm.wasm',
        },
        {
          from: path.resolve(__dirname, '../memory-core/src/db/migrations/*.sql'),
          to: '[name][ext]',
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
