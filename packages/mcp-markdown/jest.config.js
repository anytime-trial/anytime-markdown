const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // markdown-engine（フレームワーク非依存層）を直接解決（workspace symlink 不要）
    '^@anytime-markdown/markdown-engine$': '<rootDir>/../markdown-engine/src/index.ts',
  },
};
