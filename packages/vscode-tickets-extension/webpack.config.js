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
  externals: { vscode: 'commonjs vscode' },
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](tickets-core|vscode-common))/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.json'),
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

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  mode: 'none',
  entry: './src/webview/main.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    alias: {
      'next-intl': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      'next-intl/server': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
    },
    fallback: { fs: false, path: false, crypto: false },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules[\\/](?!@anytime-markdown[\\/](tickets-core|tickets-viewer|vscode-common))/,
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
    new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('production') }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, webviewConfig];
