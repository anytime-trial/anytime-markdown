const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    '^@anytime-markdown/memory-core$': '<rootDir>/../memory-core/src/index.ts',
    // NodeNext の動的 import 指定子（'./foo.js'）を拡張子なしへ写像し ts-jest が .ts を解決できるようにする。
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  maxWorkers: 1,
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json',
    }],
  },
};
