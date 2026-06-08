const base = require('../../jest.config.base');
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
    '^@anytime-markdown/trail-core$': '<rootDir>/../trail-core/src/index.ts',
    '^@anytime-markdown/trail-core/(.*)$': '<rootDir>/../trail-core/src/$1',
  },
};
