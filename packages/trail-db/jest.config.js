const base = require('../../jest.config.base');
const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Node16 の ESM 動的 import() は .js 拡張子必須(TS2835)。ts-jest(CJS) 解決のため .js を剥がして .ts に解決させる
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // 兄弟ソースへのマップは trail-core の exports から導出する（規約外 subpath の取りこぼし防止）。
    ...buildModuleNameMapperFromExports({
      packageName: '@anytime-markdown/trail-core',
      exports: require('../trail-core/package.json').exports,
      rootToken: '<rootDir>/../trail-core',
      // testEnvironment: node の customExportConditions に合わせる。
      conditions: ['node', 'node-addons', 'default'],
    }),
  },
};
