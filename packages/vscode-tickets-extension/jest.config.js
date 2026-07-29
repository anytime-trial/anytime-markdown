const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  maxWorkers: 1,
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    '^@anytime-markdown/tickets-core$': '<rootDir>/../tickets-core/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
