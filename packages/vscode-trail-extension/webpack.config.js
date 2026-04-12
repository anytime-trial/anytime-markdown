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
    // ws のオプショナルなネイティブ依存を除外（バンドルなしで動作する）
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
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
    new CopyPlugin({
      patterns: [{
        from: path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-asm.js'),
        to: 'sql-asm.js',
      }],
    }),
  ],
  devtool: 'nosources-source-map',
};

/** @type WebpackConfig */
const trailStandaloneConfig = {
  target: 'web',
  mode: 'development',
  entry: './src/trail/standalone/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'trailstandalone.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
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
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.NEXT_PUBLIC_SHOW_UNLIMITED': JSON.stringify('1'),
    }),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new webpack.NormalModuleReplacementPlugin(/^node:path$/, require.resolve('./src/c4/standalone/shims/empty.js')),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, trailStandaloneConfig];
