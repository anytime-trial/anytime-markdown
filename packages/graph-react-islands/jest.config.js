const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@anytime-markdown/graph-core/engine$': '<rootDir>/../graph-core/src/engine/index.ts',
    '^@anytime-markdown/graph-core/state$': '<rootDir>/../graph-core/src/state/index.ts',
    '^@anytime-markdown/graph-core/types$': '<rootDir>/../graph-core/src/types.ts',
    '^@anytime-markdown/graph-core$': '<rootDir>/../graph-core/src/index.ts',
  },
};
