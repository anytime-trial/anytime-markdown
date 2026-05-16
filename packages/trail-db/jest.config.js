const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@anytime-markdown/trail-core$': '<rootDir>/../trail-core/src/index.ts',
    '^@anytime-markdown/trail-core/(.*)$': '<rootDir>/../trail-core/src/$1',
  },
};
