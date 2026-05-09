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
      // sql-wasm.js + sql-wasm.wasm を dist/ に配置 (TrailDatabase が locateFile で同階層を探す)。
      patterns: [
        {
          from: path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.js'),
          to: 'sql-wasm.js',
        },
        {
          from: path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
          to: 'sql-wasm.wasm',
        },
      ],
    }),
  ],
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig];
