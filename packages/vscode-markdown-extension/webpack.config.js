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
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  mode: 'none',

  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    alias: {
      'next-intl': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      'next-intl/server': path.resolve(__dirname, 'src/webview/shims/next-intl.ts'),
      'next/dynamic': path.resolve(__dirname, 'src/webview/shims/next-dynamic.ts'),
      '@': path.resolve(__dirname, '../markdown-core/src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules[\\/](?!@anytime-markdown)/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.webview.json',
              allowTsInNodeModules: true,
            },
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.md$/,
        type: 'asset/source',
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
    // VS Code webview cannot load dynamic chunks (CSP nonce + webview URI issues).
    // Force everything into a single bundle file.
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, webviewConfig];
