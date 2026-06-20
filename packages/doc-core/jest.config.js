const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@anytime-markdown/graph-core/src/(.*)$': '<rootDir>/../graph-core/src/$1',
    '^@anytime-markdown/graph-core$': '<rootDir>/../graph-core/src/index.ts',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'CommonJS',
      },
    },
  },
};
